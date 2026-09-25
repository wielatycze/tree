(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CommonAncestorLayout = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';

  const key = id => String(id);

  function parentIds(id, parentsByChild) {
    return (parentsByChild[key(id)] || []).filter(Boolean).map(key);
  }

  function collectLineage(startId, parentsByChild) {
    const lineage = new Set([key(startId)]);
    const queue = [key(startId)];

    while (queue.length) {
      const id = queue.shift();
      parentIds(id, parentsByChild).forEach(parentId => {
        if (lineage.has(parentId)) return;
        lineage.add(parentId);
        queue.push(parentId);
      });
    }

    return lineage;
  }

  function nearestCommonAncestors(firstId, secondId, parentsByChild) {
    const firstLineage = collectLineage(firstId, parentsByChild);
    const secondLineage = collectLineage(secondId, parentsByChild);
    const common = new Set(Array.from(firstLineage).filter(id => secondLineage.has(id)));
    if (!common.size) return [];

    const commonAboveAnother = new Set();
    common.forEach(id => {
      const queue = parentIds(id, parentsByChild);
      const seen = new Set(queue);
      while (queue.length) {
        const ancestorId = queue.shift();
        if (common.has(ancestorId)) commonAboveAnother.add(ancestorId);
        parentIds(ancestorId, parentsByChild).forEach(parentId => {
          if (seen.has(parentId)) return;
          seen.add(parentId);
          queue.push(parentId);
        });
      }
    });

    return Array.from(common).filter(id => !commonAboveAnother.has(id));
  }

  function buildMinimalGraph(firstId, secondId, parentsByChild) {
    const selectedIds = [key(firstId), key(secondId)];
    const commonAncestorIds = nearestCommonAncestors(firstId, secondId, parentsByChild);
    if (!commonAncestorIds.length) {
      return { selectedIds, commonAncestorIds: [], nodeIds: [], edges: [], ranks: {} };
    }

    const targets = new Set(commonAncestorIds);
    const canReachMemo = new Map();

    function canReachTarget(id, visiting = new Set()) {
      const personId = key(id);
      if (targets.has(personId)) return true;
      if (canReachMemo.has(personId)) return canReachMemo.get(personId);
      if (visiting.has(personId)) return false;

      const nextVisiting = new Set(visiting);
      nextVisiting.add(personId);
      const reaches = parentIds(personId, parentsByChild)
        .some(parentId => canReachTarget(parentId, nextVisiting));
      canReachMemo.set(personId, reaches);
      return reaches;
    }

    const nodeIds = new Set(selectedIds);
    const edgesByKey = new Map();

    selectedIds.forEach((startId, sourceIndex) => {
      const queue = [startId];
      const expanded = new Set();
      while (queue.length) {
        const childId = queue.shift();
        if (expanded.has(childId) || targets.has(childId)) continue;
        expanded.add(childId);

        parentIds(childId, parentsByChild).forEach(parentId => {
          if (!canReachTarget(parentId)) return;
          const edgeKey = `${childId}:${parentId}`;
          if (!edgesByKey.has(edgeKey)) {
            edgesByKey.set(edgeKey, { childId, parentId, sources: [] });
          }
          const edge = edgesByKey.get(edgeKey);
          if (!edge.sources.includes(sourceIndex)) edge.sources.push(sourceIndex);
          nodeIds.add(parentId);
          queue.push(parentId);
        });
      }
    });

    const edges = Array.from(edgesByKey.values());

    const ranks = Object.fromEntries(selectedIds.map(id => [id, 0]));
    for (let pass = 0; pass <= nodeIds.size; pass += 1) {
      let changed = false;
      edges.forEach(({ childId, parentId }) => {
        if (ranks[childId] == null) return;
        const nextRank = ranks[childId] + 1;
        if (ranks[parentId] == null || ranks[parentId] < nextRank) {
          ranks[parentId] = nextRank;
          changed = true;
        }
      });
      if (!changed) break;
    }

    return {
      selectedIds,
      commonAncestorIds,
      nodeIds: Array.from(nodeIds),
      edges,
      ranks,
    };
  }

  function findDisplayedCouples(graph, parentsByChild) {
    const edgeByKey = new Map(graph.edges.map(edge => [
      `${edge.childId}:${edge.parentId}`,
      edge,
    ]));
    const couplesByKey = new Map();

    graph.nodeIds.forEach(childId => {
      const parents = parentIds(childId, parentsByChild);
      if (parents.length !== 2) return;
      const [firstParentId, secondParentId] = parents;
      const firstEdge = edgeByKey.get(`${childId}:${firstParentId}`);
      const secondEdge = edgeByKey.get(`${childId}:${secondParentId}`);
      if (!firstEdge || !secondEdge) return;

      const coupleKey = [firstParentId, secondParentId].sort().join(':');
      if (!couplesByKey.has(coupleKey)) {
        couplesByKey.set(coupleKey, {
          firstParentId,
          secondParentId,
          childIds: [],
          sources: [],
        });
      }
      const couple = couplesByKey.get(coupleKey);
      couple.childIds.push(childId);
      [...firstEdge.sources, ...secondEdge.sources].forEach(sourceIndex => {
        if (!couple.sources.includes(sourceIndex)) couple.sources.push(sourceIndex);
      });
    });

    return Array.from(couplesByKey.values());
  }

  function layoutSourceTrees(graph, options = {}) {
    const nodeWidth = options.nodeWidth || 152;
    const siblingGap = options.siblingGap || 64;
    const sourceGap = options.sourceGap || siblingGap;
    const edgesByChild = new Map();
    graph.edges.forEach(edge => {
      if (!edgesByChild.has(edge.childId)) edgesByChild.set(edge.childId, []);
      edgesByChild.get(edge.childId).push(edge);
    });

    function buildOccurrence(id, sourceIndex, path = new Set()) {
      const nextPath = new Set(path);
      nextPath.add(id);
      const parents = (edgesByChild.get(id) || [])
        .filter(edge => edge.sources.includes(sourceIndex) && !nextPath.has(edge.parentId))
        .map(edge => buildOccurrence(edge.parentId, sourceIndex, nextPath));
      return { id, parents };
    }

    function layoutOccurrence(occurrence) {
      const parentLayouts = occurrence.parents.map(layoutOccurrence);
      if (!parentLayouts.length) {
        return {
          width: nodeWidth,
          rootX: nodeWidth / 2,
          positions: [{ id: occurrence.id, x: nodeWidth / 2 }],
        };
      }

      if (parentLayouts.length === 1) {
        const parent = parentLayouts[0];
        return {
          width: Math.max(nodeWidth, parent.width),
          rootX: parent.rootX,
          positions: [{ id: occurrence.id, x: parent.rootX }, ...parent.positions],
        };
      }

      const [first, second] = parentLayouts;
      const secondOffset = first.width + siblingGap;
      const firstRootX = first.rootX;
      const secondRootX = second.rootX + secondOffset;
      return {
        width: first.width + siblingGap + second.width,
        rootX: (firstRootX + secondRootX) / 2,
        positions: [
          { id: occurrence.id, x: (firstRootX + secondRootX) / 2 },
          ...first.positions,
          ...second.positions.map(position => ({ ...position, x: position.x + secondOffset })),
        ],
      };
    }

    const candidatesById = new Map();
    let nextOffset = 0;
    graph.selectedIds.forEach((selectedId, sourceIndex) => {
      const layout = layoutOccurrence(buildOccurrence(selectedId, sourceIndex));
      layout.positions.forEach(position => {
        if (!candidatesById.has(position.id)) candidatesById.set(position.id, []);
        candidatesById.get(position.id).push(position.x + nextOffset);
      });
      nextOffset += layout.width + sourceGap;
    });

    const xById = {};
    candidatesById.forEach((candidates, id) => {
      xById[id] = candidates.reduce((sum, x) => sum + x, 0) / candidates.length;
    });
    return {
      xById,
      width: Math.max(0, nextOffset - sourceGap),
    };
  }

  return {
    collectLineage,
    nearestCommonAncestors,
    buildMinimalGraph,
    findDisplayedCouples,
    layoutSourceTrees,
  };
});
