const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const TreeLayout = require('../tree-layout');
const DescendantLayout = require('../descendant-layout');

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

function lineNumber(line, attr) {
  return Number(line.attributes[attr]);
}

function horizontalSegmentsOverlap(a, b) {
  const aLeft = Math.min(lineNumber(a, 'x1'), lineNumber(a, 'x2'));
  const aRight = Math.max(lineNumber(a, 'x1'), lineNumber(a, 'x2'));
  const bLeft = Math.min(lineNumber(b, 'x1'), lineNumber(b, 'x2'));
  const bRight = Math.max(lineNumber(b, 'x1'), lineNumber(b, 'x2'));

  return Math.max(aLeft, bLeft) < Math.min(aRight, bRight);
}

function verticalCrossesHorizontal(vertical, horizontal) {
  const x = lineNumber(vertical, 'x1');
  const y = lineNumber(horizontal, 'y1');
  const verticalTop = Math.min(lineNumber(vertical, 'y1'), lineNumber(vertical, 'y2'));
  const verticalBottom = Math.max(lineNumber(vertical, 'y1'), lineNumber(vertical, 'y2'));
  const horizontalLeft = Math.min(lineNumber(horizontal, 'x1'), lineNumber(horizontal, 'x2'));
  const horizontalRight = Math.max(lineNumber(horizontal, 'x1'), lineNumber(horizontal, 'x2'));

  return x > horizontalLeft &&
    x < horizontalRight &&
    y > verticalTop &&
    y < verticalBottom;
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

function descendantDepthOf(rootId, childrenByParent) {
  let depth = 0;
  let queue = [String(rootId)];

  while (queue.length) {
    const next = [];
    for (const id of queue) {
      for (const childId of childrenByParent[id] || []) {
        next.push(String(childId));
      }
    }
    if (!next.length) break;
    depth += 1;
    queue = next;
  }

  return depth;
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
    DescendantLayout,
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
    const childrenByParent = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'data/children.json'), 'utf8'));
    const maxDepth = descendantDepthOf(11083, childrenByParent);
    const buttons = descendantLimitOptions.children;
    const buttonValues = buttons.map(button => button.dataset.limit);
    const activeButton = buttons.find(button => button.className.includes('generation-limit-btn-active'));

    assert.strictEqual(descendantLimitControl.style.display, 'flex');
    assert.ok(buttonValues.includes('all'), 'expected the all option to be present');
    assert.ok(buttonValues.includes('1'), 'expected the minimum generation limit to be 1');
    assert.ok(!buttonValues.includes(String(maxDepth)), 'expected the max generation to be represented by all only');
    assert.ok(activeButton, 'expected one active generation button');
    assert.strictEqual(activeButton.dataset.limit, 'all');
    assert.strictEqual(activeButton.textContent, 'Усе');
    assert.strictEqual(activeButton.attributes['aria-pressed'], 'true');

    const duplicateMax = await renderTreeFixture(11083, 'descendants', maxDepth);
    const duplicateMaxActive = duplicateMax.descendantLimitOptions.children
      .find(button => button.className.includes('generation-limit-btn-active'));

    assert.strictEqual(duplicateMaxActive.dataset.limit, 'all');
  });

  it('hides the descendants generation selector outside descendants mode', async function() {
    const { descendantLimitControl } = await renderTreeFixture(11083, 'ancestors');

    assert.strictEqual(descendantLimitControl.style.display, 'none');
  });

  it('does not render a children row in ancestors mode', async function() {
    const { nodes } = await renderTreeFixture(11083, 'ancestors');
    const root = nodes.find(node => node.className.includes('is-root'));
    const maxTop = Math.max(...nodes.map(node => node.top));

    assert.ok(root, 'expected the root node to be rendered');
    assert.ok(maxTop <= root.top, 'expected ancestors mode not to render descendants below the root');
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

  it('orders child-family blocks by oldest child birth year', async function() {
    const { nodes } = await renderTreeFixture(1160, 'descendants', 1);
    const root = nodes.find(node => node.className.includes('is-root'));
    const childRow = nodes.filter(node => node.top === root.top + ROW_H);
    const byId = new Map(childRow.map(node => [node.id, node]));

    assert.ok(byId.has('10562'), 'expected Шабан Сергей Ильин to render');
    assert.ok(byId.has('10560'), 'expected Шабан Карп Ильин to render');
    assert.ok(byId.has('7212'), 'expected Шабан Семен Ильин to render');
    assert.ok(byId.has('7712'), 'expected Павловец Ирина Ильина to render');
    assert.ok(byId.has('7713'), 'expected Павловец Елена Ильина to render');

    const sergeyLeft = byId.get('10562').left;
    for (const id of ['10560', '7212', '7712', '7713']) {
      assert.ok(sergeyLeft < byId.get(id).left, `expected Сергей to be left of child ${id}`);
    }
  });

  it('keeps child-family connector horizontals from overlapping', async function() {
    for (const rootId of [3145, 1160, 11083, 748, 508, 1658]) {
      const { lines } = await renderTreeFixture(rootId, 'descendants');
      const childHorizontals = lines.filter(line =>
        line.attributes.stroke === '#999' &&
        lineNumber(line, 'y1') === lineNumber(line, 'y2') &&
        lineNumber(line, 'x1') !== lineNumber(line, 'x2')
      );

      for (let i = 0; i < childHorizontals.length; i += 1) {
        for (let j = i + 1; j < childHorizontals.length; j += 1) {
          const a = childHorizontals[i];
          const b = childHorizontals[j];
          if (lineNumber(a, 'y1') !== lineNumber(b, 'y1')) continue;

          assert.ok(
            !horizontalSegmentsOverlap(a, b),
            `expected child connector horizontals not to overlap for root ${rootId} at y=${lineNumber(a, 'y1')}`
          );
        }
      }
    }
  });

  it('keeps child-family connector verticals from crossing horizontals', async function() {
    for (const rootId of [3145, 1964, 1160, 11083, 748, 508, 1658]) {
      const { lines } = await renderTreeFixture(rootId, 'descendants');
      const childLines = lines.filter(line => line.attributes.stroke === '#999');
      const verticals = childLines.filter(line =>
        lineNumber(line, 'x1') === lineNumber(line, 'x2') &&
        lineNumber(line, 'y1') !== lineNumber(line, 'y2')
      );
      const horizontals = childLines.filter(line =>
        lineNumber(line, 'y1') === lineNumber(line, 'y2') &&
        lineNumber(line, 'x1') !== lineNumber(line, 'x2')
      );

      for (const vertical of verticals) {
        for (const horizontal of horizontals) {
          assert.ok(
            !verticalCrossesHorizontal(vertical, horizontal),
            `expected child connector verticals not to cross horizontals for root ${rootId}`
          );
        }
      }
    }
  });

  it('draws a straight connector to a single child when it fits under the family anchor', async function() {
    const { nodes, lines } = await renderTreeFixture(3145, 'descendants');
    const child = nodes.find(node => node.id === '4045');
    const childCx = child.left + NODE_W / 2;
    const childVertical = lines.find(line =>
      line.attributes.stroke === '#999' &&
      lineNumber(line, 'x1') === childCx &&
      lineNumber(line, 'x2') === childCx &&
      lineNumber(line, 'y2') === child.top
    );
    const dogleg = lines.find(line =>
      line.attributes.stroke === '#999' &&
      lineNumber(line, 'y1') === lineNumber(line, 'y2') &&
      Math.min(lineNumber(line, 'x1'), lineNumber(line, 'x2')) < childCx &&
      Math.max(lineNumber(line, 'x1'), lineNumber(line, 'x2')) === childCx
    );

    assert.ok(childVertical, 'expected a vertical connector into the single child');
    assert.ok(!dogleg, 'expected no horizontal dogleg into the single child');
  });

  it('centers an only child from an only spouse on the family child-drop anchor', async function() {
    const { nodes, lines } = await renderTreeFixture(235, 'descendants');
    const root = nodes.find(node => node.id === '235');
    const child = nodes.find(node => node.id === '15772');
    const marriageLine = lines.find(line =>
      line.attributes.stroke === '#999' &&
      line.attributes['stroke-dasharray'] === '5,4' &&
      lineNumber(line, 'y1') === root.top + NODE_H / 2 &&
      lineNumber(line, 'y2') === root.top + NODE_H / 2
    );

    const anchorCx = (lineNumber(marriageLine, 'x1') + lineNumber(marriageLine, 'x2')) / 2;
    const childCx = child.left + NODE_W / 2;

    assert.strictEqual(childCx, anchorCx);
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

  it('keeps ancestor skew connectors straight without duplicating parent bars', async function() {
    const { lines } = await renderTreeFixture(10536, 'ancestors');
    const parentBars = lines.filter(line =>
      line.attributes.stroke === '#aaa' &&
      lineNumber(line, 'y1') === lineNumber(line, 'y2')
    );
    const offsetHorizontals = lines.filter(line =>
      line.attributes.stroke === '#999' &&
      lineNumber(line, 'y1') === lineNumber(line, 'y2') &&
      lineNumber(line, 'x1') !== lineNumber(line, 'x2')
    );
    const offsetVerticals = lines.filter(line =>
      line.attributes.stroke === '#999' &&
      lineNumber(line, 'x1') === lineNumber(line, 'x2') &&
      lineNumber(line, 'y1') !== lineNumber(line, 'y2')
    );

    for (const parentBar of parentBars) {
      for (const offset of offsetHorizontals) {
        if (lineNumber(parentBar, 'y1') !== lineNumber(offset, 'y1')) continue;

        assert.ok(
          !horizontalSegmentsOverlap(parentBar, offset),
          'expected ancestor skew offset not to overlap the parent bar'
        );
      }
    }

    for (const offset of offsetHorizontals) {
      assert.ok(
        offsetVerticals.some(vertical =>
          lineNumber(vertical, 'x1') === lineNumber(offset, 'x2') &&
          lineNumber(vertical, 'y1') === lineNumber(offset, 'y1')
        ),
        'expected skew offset to continue as a straight vertical line from the same Y'
      );
    }
  });

  it('centers every rendered child under the midpoint of both rendered parents', async function() {
    const rootId = 10536;
    const parentsByChild = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'data/parents.json'), 'utf8'));
    const { nodes } = await renderTreeFixture(rootId, 'ancestors');
    const byId = new Map(nodes.map(node => [node.id, node]));

    for (const node of nodes) {
      const [fatherId, motherId] = parentsByChild[node.id] || [];
      if (!fatherId || !motherId) continue;
      const father = byId.get(String(fatherId));
      const mother = byId.get(String(motherId));
      if (!father || !mother) continue;

      const childCx = node.left + NODE_W / 2;
      const parentMid = (father.left + NODE_W / 2 + mother.left + NODE_W / 2) / 2;

      assert.strictEqual(childCx, parentMid, `expected ${node.id} to be centered under both parents`);
    }
  });

  it('renders pedigree-collapse ancestors once with visible graph connectors', async function() {
    const { nodes, lines } = await renderTreeFixture(16808, 'ancestors');
    const duplicateAncestors = ['1489', '6330', '18513', '18514'];

    for (const id of duplicateAncestors) {
      assert.strictEqual(
        nodes.filter(node => node.id === id).length,
        1,
        `expected pedigree-collapse ancestor ${id} to render once`
      );
    }

    for (const id of ['1489', '6330']) {
      const node = nodes.find(renderedNode => renderedNode.id === id);
      const cx = node.left + NODE_W / 2;
      assert.ok(
        lines.some(line =>
          line.attributes.stroke === '#999' &&
          lineNumber(line, 'x1') === cx &&
          lineNumber(line, 'x2') === cx &&
          lineNumber(line, 'y2') === node.top
        ),
        `expected pedigree-collapse ancestor ${id} to have a visible child connector`
      );
    }

    assert.ok(
      lines.some(line => line.attributes.stroke === '#fff' && Number(line.attributes['stroke-width']) > 1.5),
      'expected cased graph connector lines so crossings remain legible'
    );
  });

  it('routes graph child branches below the parent couple bar', async function() {
    const { nodes, lines } = await renderTreeFixture(16808, 'ancestors');
    const byId = new Map(nodes.map(node => [node.id, node]));
    const fatherCx = byId.get('1489').left + NODE_W / 2;
    const motherCx = byId.get('6330').left + NODE_W / 2;
    const childCx = byId.get('1490').left + NODE_W / 2;
    const parentBar = lines.find(line =>
      line.attributes.stroke === '#aaa' &&
      lineNumber(line, 'y1') === lineNumber(line, 'y2') &&
      Math.min(lineNumber(line, 'x1'), lineNumber(line, 'x2')) === Math.min(fatherCx, motherCx) &&
      Math.max(lineNumber(line, 'x1'), lineNumber(line, 'x2')) === Math.max(fatherCx, motherCx)
    );
    const childBranch = lines.find(line =>
      line.attributes.stroke === '#999' &&
      lineNumber(line, 'y1') === lineNumber(line, 'y2') &&
      Math.min(lineNumber(line, 'x1'), lineNumber(line, 'x2')) <= childCx &&
      Math.max(lineNumber(line, 'x1'), lineNumber(line, 'x2')) >= childCx
    );

    assert.ok(parentBar, 'expected a parent couple bar between 1489 and 6330');
    assert.ok(childBranch, 'expected a horizontal child branch toward 1490');
    assert.ok(
      lineNumber(childBranch, 'y1') > lineNumber(parentBar, 'y1'),
      'expected child branch to run below the parent couple bar'
    );
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
