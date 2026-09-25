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
      let leftSpouseIndex = 0;
      let rightSpouseIndex = 0;
      const leftSpouseOffsets = leftFams.map(fam => fam.spouse
        ? -(nodeWidth + spouseGap + leftSpouseIndex++ * (nodeWidth + spouseGap))
        : null
      );
      const rightSpouseOffsets = rightFams.map(fam => fam.spouse
        ? nodeWidth + spouseGap + rightSpouseIndex++ * (nodeWidth + spouseGap)
        : null
      );
      const spouseOffsets = [...leftSpouseOffsets, ...rightSpouseOffsets];
      const marriageFromOffsets = [];
      const anchorOffsets = [];
      let previousLeftSpouseOffset = 0;
      let previousRightSpouseOffset = 0;

      orderedFams.forEach((fam, index) => {
        if (!fam.spouse) {
          marriageFromOffsets.push(0);
          anchorOffsets.push(0);
          return;
        }

        const spouseOffset = spouseOffsets[index];
        const isLeft = index < leftFams.length;
        const fromOffset = isLeft ? previousLeftSpouseOffset : previousRightSpouseOffset;
        marriageFromOffsets.push(fromOffset);
        anchorOffsets.push((fromOffset + spouseOffset) / 2);

        if (isLeft) previousLeftSpouseOffset = spouseOffset;
        else previousRightSpouseOffset = spouseOffset;
      });

      return {
        orderedFams,
        leftFams,
        rightFams,
        leftSpouseOffsets,
        rightSpouseOffsets,
        spouseOffsets,
        marriageFromOffsets,
        anchorOffsets,
      };
    }

    function childBlockLeftForFamily(blockLeft, blockWidth, childrenWidth, childLayouts, anchorOffset, allowOverflow = false) {
      const centeredLeft = blockLeft + Math.max(0, (blockWidth - childrenWidth) / 2);
      if (childLayouts.length !== 1) return centeredLeft;

      const anchoredLeft = anchorOffset - childLayouts[0].rootOffset;
      const fitsBlock = anchoredLeft >= blockLeft && anchoredLeft + childrenWidth <= blockLeft + blockWidth;
      return allowOverflow || fitsBlock ? anchoredLeft : centeredLeft;
    }

    function leafLayout() {
      return {
        width: nodeWidth,
        rootOffset: nodeWidth / 2,
        contours: [{ left: -nodeWidth / 2, right: nodeWidth / 2 }],
      };
    }

    function layoutContours(layout) {
      return layout.contours || [{
        left: -layout.rootOffset,
        right: layout.width - layout.rootOffset,
      }];
    }

    function mergeContour(contours, depth, left, right) {
      const existing = contours[depth];
      if (!existing) {
        contours[depth] = { left, right };
        return;
      }
      existing.left = Math.min(existing.left, left);
      existing.right = Math.max(existing.right, right);
    }

    function packChildLayouts(childLayouts, separation = gapX) {
      if (!childLayouts.length) {
        return { width: nodeWidth, rootOffsets: [], contours: [] };
      }

      const packedContours = [];
      const rootPositions = [];

      childLayouts.forEach((layout, index) => {
        const contours = layoutContours(layout);
        let rootPosition = 0;

        if (index > 0) {
          rootPosition = -Infinity;
          contours.forEach((contour, depth) => {
            const packed = packedContours[depth];
            if (!packed) return;
            rootPosition = Math.max(
              rootPosition,
              packed.right + separation - contour.left
            );
          });
        }

        contours.forEach((contour, depth) => {
          mergeContour(
            packedContours,
            depth,
            rootPosition + contour.left,
            rootPosition + contour.right
          );
        });
        rootPositions.push(rootPosition);
      });

      const minX = Math.min(...packedContours.filter(Boolean).map(contour => contour.left));
      const maxX = Math.max(...packedContours.filter(Boolean).map(contour => contour.right));

      return {
        width: maxX - minX,
        rootOffsets: rootPositions.map(position => position - minX),
        contours: packedContours.map(contour => contour && ({
          left: contour.left - minX,
          right: contour.right - minX,
        })),
      };
    }

    function makeChildFamilyBlocks(orderedFams, remainingGenerations, visiting = new Set()) {
      return orderChildFamilyBlocks(orderedFams.map((fam, fi) => {
        const children = Array.isArray(fam.children) ? fam.children : [];
        const childLayouts = children.map(child =>
          computeLayout(child.id, remainingGenerations - 1, visiting)
        );
        const packedChildren = packChildLayouts(childLayouts);
        const childrenWidth = packedChildren.width;
        const blockWidth = Math.max(childrenWidth, nodeWidth);
        return {
          fam,
          fi,
          children,
          childLayouts,
          childRootOffsets: packedChildren.rootOffsets,
          childContours: packedChildren.contours,
          childrenWidth,
          blockWidth,
          hasSpouse: !!fam.spouse,
        };
      }));
    }

    function familyBlockAnchorOffset(block, anchorOffsets) {
      return block.hasSpouse ? anchorOffsets[block.fi] : 0;
    }

    function desiredBlockLeftForAnchor(block, anchorOffset) {
      return anchorOffset - block.blockWidth / 2;
    }

    function positionFamilyBlocks(familyBlocks, anchorOffsets, centeredStart = null) {
      if (!familyBlocks.length) return [];

      if (centeredStart != null) {
        let cursor = centeredStart;
        return familyBlocks.map(block => {
          const blockLeft = cursor;
          cursor += block.blockWidth + familyGap;
          return blockLeft;
        });
      }

      const blockLefts = familyBlocks.map(block =>
        desiredBlockLeftForAnchor(block, familyBlockAnchorOffset(block, anchorOffsets))
      );
      const packedContours = [];

      familyBlocks.forEach((block, index) => {
        if (index > 0) {
          let minLeft = -Infinity;
          block.childContours.forEach((contour, depth) => {
            const packed = packedContours[depth];
            if (!packed) return;
            minLeft = Math.max(minLeft, packed.right + familyGap - contour.left);
          });
          blockLefts[index] = Math.max(blockLefts[index], minLeft);
        }

        block.childContours.forEach((contour, depth) => {
          mergeContour(
            packedContours,
            depth,
            blockLefts[index] + contour.left,
            blockLefts[index] + contour.right
          );
        });
      });

      const occupiedContours = packedContours.filter(Boolean);
      const minX = Math.min(...occupiedContours.map(contour => contour.left));
      const maxX = Math.max(...occupiedContours.map(contour => contour.right));
      const centerShift = -(minX + maxX) / 2;
      return blockLefts.map(left => left + centerShift);
    }

    function computeLayout(personId, remainingGenerations = Infinity, visiting = new Set()) {
      const cacheKey = `${personId}:${remainingGenerations === Infinity ? 'all' : remainingGenerations}`;
      if (layoutCache.has(cacheKey)) return layoutCache.get(cacheKey);
      const personKey = String(personId);
      if (visiting.has(personKey)) return leafLayout();
      const nextVisiting = new Set(visiting);
      nextVisiting.add(personKey);

      const families = orderFamilies(getFamilies(personId));
      if (!families.length || remainingGenerations <= 0) {
        const layout = leafLayout();
        layoutCache.set(cacheKey, layout);
        return layout;
      }

      const { orderedFams, spouseOffsets, anchorOffsets } = splitFamilies(families);
      const familyBlocks = makeChildFamilyBlocks(orderedFams, remainingGenerations, nextVisiting);
      if (!familyBlocks.length) {
        const layout = leafLayout();
        layoutCache.set(cacheKey, layout);
        return layout;
      }
      const totalFamilyWidth = familyBlocks.length
        ? familyBlocks.reduce((sum, block) => sum + block.blockWidth, 0) + (familyBlocks.length - 1) * familyGap
        : nodeWidth;
      const anchorOffset = familyBlocks.length === 1 && familyBlocks[0].hasSpouse
        ? anchorOffsets[familyBlocks[0].fi]
        : 0;
      const childrenStart = anchorOffset - totalFamilyWidth / 2;
      const blockLefts = positionFamilyBlocks(
        familyBlocks,
        anchorOffsets,
        familyBlocks.length === 1 ? childrenStart : null
      );
      const contours = [{ left: -nodeWidth / 2, right: nodeWidth / 2 }];

      familyBlocks.forEach(block => {
        if (!block.fam.spouse) return;
        const spouseOffset = spouseOffsets[block.fi];
        mergeContour(
          contours,
          0,
          spouseOffset - nodeWidth / 2,
          spouseOffset + nodeWidth / 2
        );
      });

      familyBlocks.forEach((block, blockIndex) => {
        const anchorOffsetForBlock = familyBlockAnchorOffset(block, anchorOffsets);
        const shouldUseCompactAnchor = familyBlocks.length === 1;
        const blockLeft = blockLefts[blockIndex];
        const childBlockLeft = childBlockLeftForFamily(
          blockLeft,
          block.blockWidth,
          block.childrenWidth,
          block.childLayouts,
          anchorOffsetForBlock,
          shouldUseCompactAnchor
        );
        block.childLayouts.forEach((childLayout, childIndex) => {
          const childCx = childBlockLeft + block.childRootOffsets[childIndex];
          layoutContours(childLayout).forEach((contour, depth) => {
            mergeContour(
              contours,
              depth + 1,
              childCx + contour.left,
              childCx + contour.right
            );
          });
        });
      });

      const minX = Math.min(...contours.filter(Boolean).map(contour => contour.left));
      const maxX = Math.max(...contours.filter(Boolean).map(contour => contour.right));
      const layout = { width: maxX - minX, rootOffset: -minX, contours };
      layoutCache.set(cacheKey, layout);
      return layout;
    }

    function computeDepth(personId, maxDepth = Infinity) {
      const memo = new Map();

      function depthFrom(id, remaining, visiting) {
        if (remaining <= 0) return 0;
        const personKey = String(id);
        if (visiting.has(personKey)) return 0;
        const memoKey = `${personKey}:${remaining === Infinity ? 'all' : remaining}`;
        if (memo.has(memoKey)) return memo.get(memoKey);

        const nextVisiting = new Set(visiting);
        nextVisiting.add(personKey);
        const childIds = getFamilies(id).flatMap(fam =>
          (Array.isArray(fam.children) ? fam.children : []).map(child => child.id)
        );
        const depth = childIds.length
          ? 1 + Math.max(...childIds.map(childId =>
            depthFrom(childId, remaining - 1, nextVisiting)
          ))
          : 0;
        memo.set(memoKey, depth);
        return depth;
      }

      return depthFrom(personId, maxDepth, new Set());
    }

    function assignConnectorLanes(blocks) {
      const constraints = [];
      const constraintKeys = new Set();

      function hasPath(fromIndex, toIndex, seen = new Set()) {
        if (fromIndex === toIndex) return true;
        if (seen.has(fromIndex)) return false;
        seen.add(fromIndex);

        return constraints.some(([higherIndex, lowerIndex]) =>
          higherIndex === fromIndex && hasPath(lowerIndex, toIndex, seen)
        );
      }

      function addConstraint(higherIndex, lowerIndex) {
        if (higherIndex === lowerIndex) return false;
        const key = `${higherIndex}:${lowerIndex}`;
        if (constraintKeys.has(key)) return true;
        if (hasPath(lowerIndex, higherIndex)) return false;
        constraintKeys.add(key);
        constraints.push([higherIndex, lowerIndex]);
        return true;
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

      blocks.forEach((block, blockIndex) => {
        blocks.forEach((other, otherIndex) => {
          if (blockIndex >= otherIndex) return;

          if (hasPath(otherIndex, blockIndex)) {
            addConstraint(otherIndex, blockIndex);
          } else {
            addConstraint(blockIndex, otherIndex) || addConstraint(otherIndex, blockIndex);
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

    function positionChildFamilyBlocks(parentCx, families, remainingGenerations, margin, parentId = null) {
      const orderedFamilies = orderFamilies((families || []).filter(Boolean));
      const familySplit = splitFamilies(orderedFamilies);
      const visiting = parentId == null ? new Set() : new Set([String(parentId)]);
      const famBlocks = makeChildFamilyBlocks(
        familySplit.orderedFams,
        remainingGenerations,
        visiting
      );
      const belowWidth = famBlocks.length
        ? famBlocks.reduce((sum, block) => sum + block.blockWidth, 0) + (famBlocks.length - 1) * familyGap
        : 0;
      const anchorCxList = familySplit.anchorOffsets.map(offset => parentCx + offset);
      const singleFamilyAnchor = treeLayout.getAnchorForSingleFamily(famBlocks, anchorCxList);
      const childStart = treeLayout.computeChildrenStart(parentCx, singleFamilyAnchor, belowWidth, margin);
      const relativeBlockLefts = positionFamilyBlocks(
        famBlocks,
        familySplit.anchorOffsets,
        famBlocks.length === 1 ? childStart - parentCx : null
      );
      const positionedBlocks = [];

      famBlocks.forEach((block, blockIndex) => {
        const compactAnchorCx = block.fam.spouse
          ? parentCx + familySplit.anchorOffsets[block.fi]
          : parentCx;
        const blockLeft = parentCx + relativeBlockLefts[blockIndex];
        const shouldUseCompactAnchor = famBlocks.length === 1;
        const childBlockLeft = childBlockLeftForFamily(
          blockLeft,
          block.blockWidth,
          block.childrenWidth,
          block.childLayouts,
          compactAnchorCx,
          shouldUseCompactAnchor
        );
        const childCenters = block.childRootOffsets.map(offset => childBlockLeft + offset);
        const spouseCx = block.fam.spouse
          ? parentCx + familySplit.spouseOffsets[block.fi]
          : null;
        const marriageFromCx = block.fam.spouse
          ? parentCx + familySplit.marriageFromOffsets[block.fi]
          : null;
        const anchorCx = block.fam.spouse ? compactAnchorCx : parentCx;

        positionedBlocks.push({
          ...block,
          anchorCx,
          spouseCx,
          marriageFromCx,
          blockLeft,
          childBlockLeft,
          childCenters,
          firstCx: childCenters[0],
          lastCx: childCenters[childCenters.length - 1],
          horizontalLeft: Math.min(anchorCx, childCenters[0]),
          horizontalRight: Math.max(anchorCx, childCenters[childCenters.length - 1]),
        });
      });

      assignConnectorLanes(positionedBlocks);
      return { ...familySplit, famBlocks, positionedBlocks, belowWidth };
    }

    function connectorLaneGap(blocks, baseDropY, minimumDropY = null) {
      const gap = blocks.reduce((currentGap, block) => {
        if (!block.connectorLane) return currentGap;
        const availableHeight = minimumDropY == null
          ? baseDropY - block.stubStartY - 8
          : baseDropY - minimumDropY;
        return Math.min(currentGap, availableHeight / block.connectorLane);
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
      packChildLayouts,
      positionFamilyBlocks,
    };
  }

  return { create, rangesOverlap, pointInsideRange };
});
