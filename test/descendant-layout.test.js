const assert = require('assert');
const DescendantLayout = require('../descendant-layout');
const TreeLayout = require('../tree-layout');

const NODE_W = 152;
const GAP_X = 20;
const SP_GAP = 32;
const FAM_GAP = 40;
const STAGGER = 22;

function makeLayout(familiesById = {}) {
  return DescendantLayout.create({
    nodeWidth: NODE_W,
    gapX: GAP_X,
    spouseGap: SP_GAP,
    familyGap: FAM_GAP,
    stagger: STAGGER,
    birthYear: person => person.birthYear || 9999,
    getFamilies: personId => familiesById[personId] || [],
    treeLayout: TreeLayout,
  });
}

describe('DescendantLayout', function() {
  it('orders families by oldest child birth year', function() {
    const layout = makeLayout();
    const younger = { children: [{ id: 1, birthYear: 1900 }] };
    const older = { children: [{ id: 2, birthYear: 1880 }] };

    assert.deepStrictEqual(layout.orderFamilies([younger, older]), [older, younger]);
  });

  it('aligns a single child subtree to the family anchor when overflow is allowed', function() {
    const layout = makeLayout();
    const childLayouts = [{ width: 336, rootOffset: 76 }];

    const left = layout.childBlockLeftForFamily(0, NODE_W + SP_GAP + NODE_W, 336, childLayouts, 168, true);

    assert.strictEqual(left + childLayouts[0].rootOffset, 168);
  });

  it('keeps a single child subtree centered when anchor overflow is not allowed', function() {
    const layout = makeLayout();
    const childLayouts = [{ width: 336, rootOffset: 76 }];

    const left = layout.childBlockLeftForFamily(0, NODE_W + SP_GAP + NODE_W, 336, childLayouts, 168, false);

    assert.strictEqual(left, 0);
  });

  it('assigns different connector lanes to separate family blocks', function() {
    const layout = makeLayout();
    const blocks = [
      { anchorCx: 100, childCenters: [80], horizontalLeft: 80, horizontalRight: 100 },
      { anchorCx: 200, childCenters: [220], horizontalLeft: 200, horizontalRight: 220 },
    ];

    layout.assignConnectorLanes(blocks);

    assert.notStrictEqual(blocks[0].connectorLane, blocks[1].connectorLane);
  });
});
