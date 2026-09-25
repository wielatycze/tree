const assert = require('assert');
const CommonAncestorLayout = require('../common-ancestor-layout');

describe('CommonAncestorLayout', function() {
  it('keeps multiple nearest common ancestors', function() {
    const parents = {
      a: ['father', 'mother'],
      b: ['father', 'mother'],
      father: ['grandfather', null],
      mother: [null, 'grandmother'],
    };

    const graph = CommonAncestorLayout.buildMinimalGraph('a', 'b', parents);

    assert.deepStrictEqual(graph.commonAncestorIds.sort(), ['father', 'mother']);
    assert.deepStrictEqual(graph.nodeIds.sort(), ['a', 'b', 'father', 'mother']);
    assert.strictEqual(graph.edges.length, 4);
  });

  it('stops at the nearest common ancestors', function() {
    const parents = {
      a: ['parent-a', null],
      b: ['parent-b', null],
      'parent-a': ['shared', null],
      'parent-b': ['shared', null],
      shared: ['older-shared', null],
      'older-shared': [],
    };

    const graph = CommonAncestorLayout.buildMinimalGraph('a', 'b', parents);

    assert.deepStrictEqual(graph.commonAncestorIds, ['shared']);
    assert.ok(graph.nodeIds.includes('shared'));
    assert.ok(!graph.nodeIds.includes('older-shared'));
  });

  it('returns an empty graph when no common ancestor exists', function() {
    const parents = {
      a: ['a-parent', null],
      b: ['b-parent', null],
    };

    const graph = CommonAncestorLayout.buildMinimalGraph('a', 'b', parents);

    assert.deepStrictEqual(graph.commonAncestorIds, []);
    assert.deepStrictEqual(graph.nodeIds, []);
    assert.deepStrictEqual(graph.edges, []);
  });

  it('groups displayed co-parents without adding people outside the minimal graph', function() {
    const parents = {
      a: ['child-a', null],
      b: ['child-b', null],
      'child-a': ['father', 'mother'],
      'child-b': ['father', 'mother'],
      sibling: ['father', 'mother'],
    };
    const graph = CommonAncestorLayout.buildMinimalGraph('a', 'b', parents);

    const couples = CommonAncestorLayout.findDisplayedCouples(graph, parents);

    assert.deepStrictEqual(couples, [{
      firstParentId: 'father',
      secondParentId: 'mother',
      childIds: ['child-a', 'child-b'],
      sources: [0, 1],
    }]);
    assert.ok(!graph.nodeIds.includes('sibling'));
  });

  it('centers each selected person under its displayed parents', function() {
    const parents = {
      a: ['a-father', 'a-mother'],
      b: ['b-father', 'b-mother'],
      'a-father': ['shared', null],
      'b-mother': ['shared', null],
      'a-mother': ['couple-father', 'couple-mother'],
      'b-father': ['couple-father', 'couple-mother'],
    };
    const graph = CommonAncestorLayout.buildMinimalGraph('a', 'b', parents);

    const layout = CommonAncestorLayout.layoutSourceTrees(graph, {
      nodeWidth: 152,
      siblingGap: 64,
      sourceGap: 64,
    });

    assert.strictEqual(
      layout.xById.a,
      (layout.xById['a-father'] + layout.xById['a-mother']) / 2
    );
    assert.strictEqual(
      layout.xById.b,
      (layout.xById['b-father'] + layout.xById['b-mother']) / 2
    );
  });
});
