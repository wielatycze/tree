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

  it('anchors later marriages between consecutive spouse cards', function() {
    const layout = makeLayout();
    const families = [
      { spouse: { id: 1 }, children: [] },
      { spouse: { id: 2 }, children: [] },
      { spouse: { id: 3 }, children: [] },
    ];

    const split = layout.splitFamilies(families);

    assert.deepStrictEqual(split.spouseOffsets, [-184, 184, 368]);
    assert.deepStrictEqual(split.marriageFromOffsets, [0, 0, 184]);
    assert.deepStrictEqual(split.anchorOffsets, [-92, 92, 276]);
  });

  it('does not reserve a spouse slot for an anonymous family', function() {
    const layout = makeLayout();
    const families = [
      { spouse: { id: 1 }, children: [] },
      { spouse: { id: 2 }, children: [] },
      { spouse: null, children: [{ id: 10 }] },
      { spouse: { id: 3 }, children: [] },
    ];

    const split = layout.splitFamilies(families);

    assert.deepStrictEqual(split.spouseOffsets, [-184, 184, null, 368]);
    assert.deepStrictEqual(split.marriageFromOffsets, [0, 0, 0, 184]);
    assert.deepStrictEqual(split.anchorOffsets, [-92, 92, 0, 276]);
  });

  it('does not reserve width for a spouse-only branch that is not rendered', function() {
    const layout = makeLayout({
      1: [{ spouse: { id: 2 }, children: [] }],
    });

    assert.deepStrictEqual(layout.computeLayout(1), {
      width: NODE_W,
      rootOffset: NODE_W / 2,
      contours: [{ left: -NODE_W / 2, right: NODE_W / 2 }],
    });
  });

  it('does not add parent-row spouse width to a child-family block', function() {
    const layout = makeLayout();
    const blocks = layout.makeChildFamilyBlocks([
      {
        spouse: { id: 2 },
        children: [{ id: 3, birthYear: 1900 }],
      },
    ], 1);

    assert.strictEqual(blocks[0].childrenWidth, NODE_W);
    assert.strictEqual(blocks[0].blockWidth, NODE_W);
  });

  it('packs a leaf next to a deep sibling using only their shared row', function() {
    const layout = makeLayout();
    const packed = layout.packChildLayouts([
      {
        width: NODE_W,
        rootOffset: NODE_W / 2,
        contours: [{ left: -NODE_W / 2, right: NODE_W / 2 }],
      },
      {
        width: 1012,
        rootOffset: 414,
        contours: [
          { left: -NODE_W / 2, right: NODE_W / 2 + NODE_W + SP_GAP },
          { left: -414, right: 598 },
        ],
      },
    ]);

    assert.strictEqual(
      packed.rootOffsets[1] - packed.rootOffsets[0],
      NODE_W + GAP_X
    );
  });

  it('packs family blocks by their shared generation contours', function() {
    const layout = makeLayout();
    const blocks = [
      {
        blockWidth: 1000,
        fi: 0,
        hasSpouse: true,
        childContours: [
          { left: 424, right: 576 },
          { left: 0, right: 1000 },
        ],
      },
      {
        blockWidth: NODE_W,
        fi: 1,
        hasSpouse: true,
        childContours: [{ left: 0, right: NODE_W }],
      },
    ];

    const positions = layout.positionFamilyBlocks(blocks, [0, 192]);

    assert.deepStrictEqual(positions, [-500, 116]);
    assert.strictEqual(
      positions[1] - (positions[0] + blocks[0].childContours[0].right),
      FAM_GAP
    );
  });

  it('centers multiple packed family contours around the parent', function() {
    const layout = makeLayout();
    const blocks = [
      {
        blockWidth: NODE_W,
        fi: 0,
        hasSpouse: true,
        childContours: [{ left: 0, right: NODE_W }],
      },
      {
        blockWidth: NODE_W,
        fi: 1,
        hasSpouse: true,
        childContours: [{ left: 0, right: NODE_W }],
      },
    ];

    const positions = layout.positionFamilyBlocks(blocks, [-92, 92]);
    const left = positions[0];
    const right = positions[1] + NODE_W;

    assert.strictEqual((left + right) / 2, 0);
    assert.strictEqual(positions[1] - (positions[0] + NODE_W), FAM_GAP);
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

  it('keeps connector lanes bounded when overlap constraints conflict', function() {
    const layout = makeLayout();
    const blocks = [
      { anchorCx: 998, childCenters: [176, 612], horizontalLeft: 176, horizontalRight: 998 },
      { anchorCx: 1182, childCenters: [896], horizontalLeft: 896, horizontalRight: 1182 },
      { anchorCx: 1090, childCenters: [1180], horizontalLeft: 1090, horizontalRight: 1180 },
      { anchorCx: 1366, childCenters: [1556, 1728, 2084], horizontalLeft: 1366, horizontalRight: 2084 },
    ];

    layout.assignConnectorLanes(blocks);

    assert.ok(
      Math.max(...blocks.map(block => block.connectorLane)) < blocks.length,
      'expected cyclic overlap constraints not to create runaway connector lanes'
    );
  });

  it('keeps the highest connector lane below the spouse row', function() {
    const layout = makeLayout();
    const blocks = [
      { connectorLane: 0, stubStartY: 572 },
      { connectorLane: 3, stubStartY: 572 },
    ];

    const gap = layout.connectorLaneGap(blocks, 680, 624);

    assert.strictEqual(680 - 3 * gap, 624);
  });
});
