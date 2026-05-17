const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const TreeLayout = require('../tree-layout');

const NODE_W = 152;
const NODE_H = 88;
const ROW_H = 168;

class FakeElement {
  constructor(tag, id = null) {
    this.tag = tag;
    this.id = id;
    this.children = [];
    this.attributes = {};
    this.dataset = {};
    this.className = '';
    this.textContent = '';
    this.offsetHeight = 48;
    this.scrollLeft = 0;
    this.scrollTop = 0;
    this._innerHTML = '';
    this.style = { cssText: '', display: '', width: '' };
    this.classList = {
      add() {},
      remove() {},
      toggle() {},
    };
  }

  appendChild(child) {
    this.children.push(child);
    return child;
  }

  addEventListener() {}

  setAttribute(name, value) {
    this.attributes[name] = String(value);
  }

  getAttribute(name) {
    return this.attributes[name];
  }

  get innerHTML() {
    return this._innerHTML;
  }

  set innerHTML(value) {
    this._innerHTML = value;
    if (value === '') this.children = [];
  }
}

function numberFromCss(cssText, property) {
  const match = new RegExp(`${property}:([\\d.-]+)px`).exec(cssText);
  return match ? Number(match[1]) : NaN;
}

function descendantsOf(rootId, childrenByParent) {
  const seen = new Set([String(rootId)]);
  const queue = [String(rootId)];

  while (queue.length) {
    const id = queue.shift();
    for (const childId of childrenByParent[id] || []) {
      const key = String(childId);
      if (seen.has(key)) continue;
      seen.add(key);
      queue.push(key);
    }
  }

  return seen;
}

function ancestorsOf(rootId, parentsByChild) {
  const seen = new Set([String(rootId)]);
  const queue = [String(rootId)];

  while (queue.length) {
    const id = queue.shift();
    for (const parentId of parentsByChild[id] || []) {
      if (!parentId) continue;
      const key = String(parentId);
      if (seen.has(key)) continue;
      seen.add(key);
      queue.push(key);
    }
  }

  return seen;
}

async function renderTreeFixture(rootId, mode = 'descendants', descendantLimit = null) {
  const elements = new Map();
  const elementById = id => {
    if (!elements.has(id)) elements.set(id, new FakeElement('div', id));
    return elements.get(id);
  };

  [
    'loading-fill',
    'loading-msg',
    'loading',
    'err-msg',
    'err',
    'canvas',
    'crumb',
    'toolbar',
    'canvas-wrap',
    'detail-name',
    'detail-info',
    'detail-nav',
    'detail-panel',
    'btn-home',
    'detail-close',
    'search-input',
    'search-results',
    'descendant-limit-control',
    'descendant-limit-options',
  ].forEach(elementById);

  const modeButtons = [new FakeElement('button'), new FakeElement('button')];
  modeButtons[0].dataset.mode = 'ancestors';
  modeButtons[1].dataset.mode = 'descendants';

  const context = {
    console,
    setTimeout,
    clearTimeout,
    TreeLayout,
    window: {
      innerWidth: 1400,
      innerHeight: 900,
      addEventListener() {},
    },
    location: { hash: `#${rootId}` },
    history: { replaceState() {} },
    document: {
      getElementById: elementById,
      createElement: tag => new FakeElement(tag),
      createElementNS: (namespace, tag) => new FakeElement(tag),
      querySelectorAll: selector => {
        if (selector === '.mode-btn') return modeButtons;
        if (selector === '.node.is-selected') return [];
        return [];
      },
      addEventListener() {},
    },
    fetch: async url => ({
      ok: true,
      json: async () => JSON.parse(fs.readFileSync(path.join(process.cwd(), url), 'utf8')),
    }),
  };
  context.globalThis = context;

  const source = fs
    .readFileSync(path.join(process.cwd(), 'tree.js'), 'utf8')
    .replace("let currentMode = 'ancestors';", `let currentMode = '${mode}';`)
    .replace('let descendantGenerationLimit = null;', `let descendantGenerationLimit = ${descendantLimit == null ? 'null' : descendantLimit};`);

  vm.runInNewContext(source, context, { filename: 'tree.js' });
  await new Promise(resolve => setTimeout(resolve, 25));

  const canvas = elementById('canvas');
  const svg = canvas.children.find(child => child.tag === 'svg');
  const nodes = canvas.children
    .filter(child => child.className && child.className.includes('node'))
    .map(node => ({
      id: String(node.dataset.id),
      left: numberFromCss(node.style.cssText, 'left'),
      top: numberFromCss(node.style.cssText, 'top'),
      className: node.className,
    }));

  const lines = svg
    ? svg.children.filter(child => child.tag === 'line')
    : [];

  return {
    nodes,
    lines,
    canvas,
    descendantLimitControl: elementById('descendant-limit-control'),
    descendantLimitOptions: elementById('descendant-limit-options'),
  };
}

function renderDescendantFixture(rootId) {
  return renderTreeFixture(rootId, 'descendants');
}

describe('Descendant mode real render', function() {
  it('renders grandchildren and deeper descendants, not only immediate children', async function() {
    const { nodes } = await renderDescendantFixture(11083);
    const rowTops = new Set(nodes.map(node => node.top));

    assert.ok(nodes.length > 10, 'expected descendants beyond the root children to render');
    assert.ok(rowTops.size > 3, 'expected multiple descendant generations below the root');
  });

  it('renders descendant spouses below the root generation', async function() {
    const { lines } = await renderDescendantFixture(11083);
    const descendantMarriageLines = lines.filter(line =>
      line.attributes['stroke-dasharray'] === '5,4' &&
      Number(line.attributes.y1) === Number(line.attributes.y2) &&
      Number(line.attributes.y1) > NODE_H
    );

    assert.ok(
      descendantMarriageLines.length > 0,
      'expected dashed marriage lines for spouses in descendant generations'
    );
  });

  it('shows a descendants generation selector with all selected by default', async function() {
    const { descendantLimitControl, descendantLimitOptions } = await renderDescendantFixture(11083);
    const buttons = descendantLimitOptions.children;
    const buttonValues = buttons.map(button => button.dataset.limit);
    const activeButton = buttons.find(button => button.className.includes('generation-limit-btn-active'));

    assert.strictEqual(descendantLimitControl.style.display, 'flex');
    assert.ok(buttonValues.includes('all'), 'expected the all option to be present');
    assert.ok(buttonValues.includes('1'), 'expected the minimum generation limit to be 1');
    assert.ok(activeButton, 'expected one active generation button');
    assert.strictEqual(activeButton.dataset.limit, 'all');
    assert.strictEqual(activeButton.textContent, 'Усе');
    assert.strictEqual(activeButton.attributes['aria-pressed'], 'true');
  });

  it('hides the descendants generation selector outside descendants mode', async function() {
    const { descendantLimitControl } = await renderTreeFixture(11083, 'ancestors');

    assert.strictEqual(descendantLimitControl.style.display, 'none');
  });

  it('limits descendants mode to one descendant generation', async function() {
    const { nodes, descendantLimitOptions } = await renderTreeFixture(11083, 'descendants', 1);
    const root = nodes.find(node => node.className.includes('is-root'));
    const maxTop = Math.max(...nodes.map(node => node.top));
    const activeButton = descendantLimitOptions.children.find(button => button.className.includes('generation-limit-btn-active'));

    assert.strictEqual(activeButton.dataset.limit, '1');
    assert.ok(root, 'expected the root node to be rendered');
    assert.ok(maxTop <= root.top + ROW_H, 'expected no nodes below the children generation');
  });

  it('allows a numeric descendants limit greater than one', async function() {
    const rootId = 748;
    const limited = await renderTreeFixture(rootId, 'descendants', 2);
    const all = await renderDescendantFixture(rootId);
    const root = limited.nodes.find(node => node.className.includes('is-root'));
    const allRoot = all.nodes.find(node => node.className.includes('is-root'));
    const maxLimitedTop = Math.max(...limited.nodes.map(node => node.top));
    const maxAllTop = Math.max(...all.nodes.map(node => node.top));

    const activeButton = limited.descendantLimitOptions.children.find(button => button.className.includes('generation-limit-btn-active'));

    assert.strictEqual(activeButton.dataset.limit, '2');
    assert.ok(root, 'expected the root node to be rendered');
    assert.ok(allRoot, 'expected the root node to be rendered in all mode');
    assert.ok(maxLimitedTop <= root.top + 2 * ROW_H, 'expected no nodes below the second descendant generation');
    assert.ok(maxAllTop - allRoot.top > 2 * ROW_H, 'expected all mode to render deeper generations');
  });

  it('does not overlap rendered people for wide real descendant trees', async function() {
    const roots = [11083, 748, 508, 1658];

    for (const rootId of roots) {
      const { nodes } = await renderDescendantFixture(rootId);
      const overlaps = [];

      for (let i = 0; i < nodes.length; i += 1) {
        for (let j = i + 1; j < nodes.length; j += 1) {
          const a = nodes[i];
          const b = nodes[j];
          const intersects =
            a.left < b.left + NODE_W &&
            a.left + NODE_W > b.left &&
            a.top < b.top + NODE_H &&
            a.top + NODE_H > b.top;
          if (intersects) overlaps.push([a.id, b.id]);
        }
      }

      assert.deepStrictEqual(overlaps, [], `expected no person-card overlaps for root ${rootId}`);
    }
  });

  it('keeps all descendant people within the computed canvas width', async function() {
    const rootId = 11083;
    const childrenByParent = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'data/children.json'), 'utf8'));
    const expectedDescendants = descendantsOf(rootId, childrenByParent);
    const { nodes, canvas } = await renderDescendantFixture(rootId);
    const renderedDescendants = new Set(nodes.map(node => node.id));
    const canvasWidth = numberFromCss(canvas.style.cssText, 'width');

    for (const id of expectedDescendants) {
      assert.ok(renderedDescendants.has(id), `expected descendant person ${id} to be rendered`);
    }

    for (const node of nodes) {
      assert.ok(node.left >= 0, `expected person ${node.id} not to render left of canvas`);
      assert.ok(
        node.left + NODE_W <= canvasWidth,
        `expected person ${node.id} not to render beyond canvas width`
      );
    }
  });

  it('renders every known ancestor in ancestors mode without a generation cap', async function() {
    const rootId = 18157;
    const parentsByChild = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'data/parents.json'), 'utf8'));
    const expectedAncestors = ancestorsOf(rootId, parentsByChild);
    const { nodes } = await renderTreeFixture(rootId, 'ancestors');
    const renderedPeople = new Set(nodes.map(node => node.id));

    assert.ok(expectedAncestors.size > 64, 'fixture should exercise more than four ancestor generations');
    for (const id of expectedAncestors) {
      assert.ok(renderedPeople.has(id), `expected ancestor person ${id} to render in ancestors mode`);
    }
  });

  it('renders every known ancestor in descendants mode without a generation cap', async function() {
    const rootId = 18157;
    const parentsByChild = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'data/parents.json'), 'utf8'));
    const expectedAncestors = ancestorsOf(rootId, parentsByChild);
    const { nodes } = await renderTreeFixture(rootId, 'descendants');
    const renderedPeople = new Set(nodes.map(node => node.id));

    assert.ok(expectedAncestors.size > 64, 'fixture should exercise more than four ancestor generations');
    for (const id of expectedAncestors) {
      assert.ok(renderedPeople.has(id), `expected ancestor person ${id} to render in descendants mode`);
    }
  });
});
