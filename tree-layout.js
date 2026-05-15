(function(root, factory) {
  if (typeof exports === 'object' && typeof module === 'object') {
    module.exports = factory();
  } else {
    root.TreeLayout = factory();
  }
})(typeof window !== 'undefined' ? window : globalThis, function() {
  const DEFAULT_MARGIN = 20;

  function computeChildrenStart(rootCx, anchorCx, belowWidth, margin = DEFAULT_MARGIN) {
    const centerCx = anchorCx != null ? anchorCx : rootCx;
    return Math.max(margin, centerCx - belowWidth / 2);
  }

  function shouldCenterOnAnchor(famBlocks) {
    return famBlocks.length === 1 && famBlocks[0].fam.spouse;
  }

  function getAnchorForSingleFamily(famBlocks, anchorCxList) {
    return shouldCenterOnAnchor(famBlocks)
      ? anchorCxList[famBlocks[0].fi]
      : null;
  }

  return {
    computeChildrenStart,
    shouldCenterOnAnchor,
    getAnchorForSingleFamily,
  };
});
