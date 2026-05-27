(function(root, factory) {
  if (typeof exports === 'object' && typeof module === 'object') {
    module.exports = factory();
  } else {
    root.DescendantLayout = factory();
  }
})(typeof window !== 'undefined' ? window : globalThis, function() {
  function rangesOverlap(aStart, aEnd, bStart, bEnd) {
    return Math.max(aStart, bStart) < Math.min(aEnd, bEnd);
  }

  function pointInsideRange(point, start, end) {
    return point > Math.min(start, end) && point < Math.max(start, end);
  }

  function create(options) {
    const {
      nodeWidth,
      gapX,
      spouseGap,
      familyGap,
      stagger,
      birthYear,
      getFamilies,
      treeLayout,
    } = options;
    const layoutCache = new Map();

    function familyOldestChildYear(fam) {
      const children = Array.isArray(fam.children) ? fam.children : [];
      return children.length
        ? Math.min(...children.map(child => birthYear(child)))
        : 9999;
    }

    function orderFamilies(families) {
      return families.slice().sort((a, b) =>
        familyOldestChildYear(a) - familyOldestChildYear(b)
      );
    }

    function orderChildFamilyBlocks(blocks) {
      return blocks
        .filter(block => block.children.length > 0)
        .sort((a, b) =>
          familyOldestChildYear(a.fam) - familyOldestChildYear(b.fam) ||
          a.fi - b.fi
        );
    }

    function splitFamilies(families) {
      const orderedFams = families.length > 1 ? [families[0], ...families.slice(1)] : families;
      const leftFams = families.length > 1 ? [families[0]] : [];
      const rightFams = families.length > 1 ? families.slice(1) : families;
      const leftSpouseOffsets = leftFams.map((_, i) =>
        -(nodeWidth / 2 + spouseGap + nodeWidth / 2 + i * (nodeWidth + spouseGap))
      );
      const rightSpouseOffsets = rightFams.map((_, i) =>
        nodeWidth / 2 + spouseGap + nodeWidth / 2 + i * (nodeWidth + spouseGap)
      );
      const anchorOffsets = [
        ...leftSpouseOffsets.map(offset => offset / 2),
        ...rightSpouseOffsets.map(offset => offset / 2),
      ];

      return { orderedFams, leftFams, rightFams, leftSpouseOffsets, rightSpouseOffsets, anchorOffsets };
    }

    function childBlockLeftForFamily(blockLeft, blockWidth, childrenWidth, childLayouts, anchorOffset, allowOverflow = false) {
      const centeredLeft = blockLeft + Math.max(0, (blockWidth - childrenWidth) / 2);
      if (childLayouts.length !== 1) return centeredLeft;

      const anchoredLeft = anchorOffset - childLayouts[0].rootOffset;
      const fitsBlock = anchoredLeft >= blockLeft && anchoredLeft + childrenWidth <= blockLeft + blockWidth;
      return allowOverflow || fitsBlock ? anchoredLeft : centeredLeft;
    }

    function makeChildFamilyBlocks(orderedFams, remainingGenerations) {
      return orderChildFamilyBlocks(orderedFams.map((fam, fi) => {
        const children = Array.isArray(fam.children) ? fam.children : [];
        const childLayouts = children.map(child => computeLayout(child.id, remainingGenerations - 1));
        const childrenWidth = childLayouts.length
          ? childLayouts.reduce((sum, layout) => sum + layout.width, 0) + (childLayouts.length - 1) * gapX
          : nodeWidth;
        const spouseSpan = fam.spouse ? nodeWidth + spouseGap + nodeWidth : nodeWidth;
        const blockWidth = Math.max(childrenWidth, spouseSpan, nodeWidth);
        return {
          fam,
          fi,
          children,
          childLayouts,
          childrenWidth,
          blockWidth,
          hasSpouse: !!fam.spouse,
        };
      }));
    }

    function computeLayout(personId, remainingGenerations = Infinity) {
      const cacheKey = `${personId}:${remainingGenerations === Infinity ? 'all' : remainingGenerations}`;
      if (layoutCache.has(cacheKey)) return layoutCache.get(cacheKey);

      const families = orderFamilies(getFamilies(personId));
      if (!families.length || remainingGenerations <= 0) {
        const layout = { width: nodeWidth, rootOffset: nodeWidth / 2 };
        layoutCache.set(cacheKey, layout);
        return layout;
      }

      const { orderedFams, leftSpouseOffsets, rightSpouseOffsets, anchorOffsets } = splitFamilies(families);
      const familyBlocks = makeChildFamilyBlocks(orderedFams, remainingGenerations);
      const totalFamilyWidth = familyBlocks.length
        ? familyBlocks.reduce((sum, block) => sum + block.blockWidth, 0) + (familyBlocks.length - 1) * familyGap
        : nodeWidth;
      const anchorOffset = familyBlocks.length === 1 && familyBlocks[0].hasSpouse
        ? anchorOffsets[familyBlocks[0].fi]
        : 0;
      const childrenStart = anchorOffset - totalFamilyWidth / 2;
      let cursor = childrenStart;
      let minX = -nodeWidth / 2;
      let maxX = nodeWidth / 2;

      leftSpouseOffsets.forEach(offset => {
        minX = Math.min(minX, offset - nodeWidth / 2);
        maxX = Math.max(maxX, offset + nodeWidth / 2);
      });
      rightSpouseOffsets.forEach(offset => {
        minX = Math.min(minX, offset - nodeWidth / 2);
        maxX = Math.max(maxX, offset + nodeWidth / 2);
      });

      familyBlocks.forEach(block => {
        const anchorOffsetForBlock = block.hasSpouse ? anchorOffsets[block.fi] : 0;
        const childBlockLeft = childBlockLeftForFamily(
          cursor,
          block.blockWidth,
          block.childrenWidth,
          block.childLayouts,
          anchorOffsetForBlock,
          familyBlocks.length === 1
        );
        minX = Math.min(minX, cursor, childBlockLeft);
        maxX = Math.max(maxX, cursor + block.blockWidth, childBlockLeft + block.childrenWidth);
        cursor += block.blockWidth + familyGap;
      });

      const layout = { width: maxX - minX, rootOffset: -minX };
      layoutCache.set(cacheKey, layout);
      return layout;
    }

    function computeDepth(personId, maxDepth = Infinity) {
      let depth = 0;
      let queue = [personId];
      while (queue.length && depth < maxDepth) {
        const next = [];
        for (const id of queue) {
          getFamilies(id).forEach(fam => {
            fam.children.forEach(child => next.push(child.id));
          });
        }
        if (!next.length) break;
        depth += 1;
        queue = next;
      }
      return depth;
    }

    function assignConnectorLanes(blocks) {
      const constraints = [];

      function addConstraint(higherIndex, lowerIndex) {
        if (higherIndex === lowerIndex) return;
        constraints.push([higherIndex, lowerIndex]);
      }

      blocks.forEach((block, blockIndex) => {
        blocks.forEach((other, otherIndex) => {
          if (blockIndex === otherIndex) return;

          if (pointInsideRange(block.anchorCx, other.horizontalLeft, other.horizontalRight)) {
            addConstraint(blockIndex, otherIndex);
          }

          if (block.childCenters.some(childCx =>
            pointInsideRange(childCx, other.horizontalLeft, other.horizontalRight)
          )) {
            addConstraint(otherIndex, blockIndex);
          }
        });
      });

      function hasPath(fromIndex, toIndex, seen = new Set()) {
        if (fromIndex === toIndex) return true;
        if (seen.has(fromIndex)) return false;
        seen.add(fromIndex);

        return constraints.some(([higherIndex, lowerIndex]) =>
          higherIndex === fromIndex && hasPath(lowerIndex, toIndex, seen)
        );
      }

      blocks.forEach((block, blockIndex) => {
        blocks.forEach((other, otherIndex) => {
          if (blockIndex >= otherIndex) return;

          if (hasPath(otherIndex, blockIndex)) {
            addConstraint(otherIndex, blockIndex);
          } else {
            addConstraint(blockIndex, otherIndex);
          }
        });
      });

      const lanes = blocks.map(() => 0);

      for (let pass = 0; pass < constraints.length; pass += 1) {
        let changed = false;

        constraints.forEach(([higherIndex, lowerIndex]) => {
          if (lanes[higherIndex] <= lanes[lowerIndex]) {
            lanes[higherIndex] = lanes[lowerIndex] + 1;
            changed = true;
          }
        });

        if (!changed) break;
      }

      blocks.forEach((block, index) => {
        block.connectorLane = lanes[index];
      });
    }

    function positionChildFamilyBlocks(parentCx, families, remainingGenerations, margin) {
      const orderedFamilies = orderFamilies((families || []).filter(Boolean));
      const familySplit = splitFamilies(orderedFamilies);
      const famBlocks = makeChildFamilyBlocks(familySplit.orderedFams, remainingGenerations);
      const belowWidth = famBlocks.length
        ? famBlocks.reduce((sum, block) => sum + block.blockWidth, 0) + (famBlocks.length - 1) * familyGap
        : 0;
      const anchorCxList = familySplit.anchorOffsets.map(offset => parentCx + offset);
      const singleFamilyAnchor = treeLayout.getAnchorForSingleFamily(famBlocks, anchorCxList);
      const childStart = treeLayout.computeChildrenStart(parentCx, singleFamilyAnchor, belowWidth, margin);
      const positionedBlocks = [];
      let cursor = childStart;

      famBlocks.forEach(block => {
        const anchorCx = block.fam.spouse
          ? parentCx + familySplit.anchorOffsets[block.fi]
          : parentCx;
        const blockLeft = cursor;
        const childBlockLeft = childBlockLeftForFamily(
          blockLeft,
          block.blockWidth,
          block.childrenWidth,
          block.childLayouts,
          anchorCx,
          famBlocks.length === 1
        );
        const childCenters = [];
        let childCursor = childBlockLeft;

        block.children.forEach((child, ci) => {
          const childCx = childCursor + block.childLayouts[ci].rootOffset;
          childCenters.push(childCx);
          childCursor += block.childLayouts[ci].width + gapX;
        });

        positionedBlocks.push({
          ...block,
          anchorCx,
          blockLeft,
          childBlockLeft,
          childCenters,
          firstCx: childCenters[0],
          lastCx: childCenters[childCenters.length - 1],
          horizontalLeft: Math.min(anchorCx, childCenters[0]),
          horizontalRight: Math.max(anchorCx, childCenters[childCenters.length - 1]),
        });
        cursor += block.blockWidth + familyGap;
      });

      assignConnectorLanes(positionedBlocks);
      return { ...familySplit, famBlocks, positionedBlocks, belowWidth };
    }

    function connectorLaneGap(blocks, baseDropY) {
      const gap = blocks.reduce((currentGap, block) => {
        if (!block.connectorLane) return currentGap;
        return Math.min(currentGap, (baseDropY - block.stubStartY - 8) / block.connectorLane);
      }, stagger);
      return Math.max(4, Math.min(stagger, gap));
    }

    return {
      orderFamilies,
      splitFamilies,
      computeDepth,
      computeLayout,
      makeChildFamilyBlocks,
      positionChildFamilyBlocks,
      connectorLaneGap,
      rangesOverlap,
      pointInsideRange,
      assignConnectorLanes,
      childBlockLeftForFamily,
    };
  }

  return { create, rangesOverlap, pointInsideRange };
});
