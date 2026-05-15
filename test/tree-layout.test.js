const assert = require('assert');
const { computeChildrenStart, getAnchorForSingleFamily } = require('../tree-layout');

describe('TreeLayout helper', function() {
  it('centers children block on spouse anchor for single spouse family', function() {
    const rootCx = 500;
    const anchorCx = 550;
    const belowWidth = 200;
    const start = computeChildrenStart(rootCx, anchorCx, belowWidth, 20);
    assert.strictEqual(start, 450);
  });

  it('centers children block on root when no single-family anchor exists', function() {
    const rootCx = 500;
    const anchorCx = null;
    const belowWidth = 200;
    const start = computeChildrenStart(rootCx, anchorCx, belowWidth, 20);
    assert.strictEqual(start, 400);
  });

  it('returns the spouse anchor for single spouse family', function() {
    const famBlocks = [{ fam: { spouse: { id: 1 } }, fi: 0 }];
    const anchorCxList = [300];
    assert.strictEqual(getAnchorForSingleFamily(famBlocks, anchorCxList), 300);
  });

  it('does not return an anchor for multiple families', function() {
    const famBlocks = [
      { fam: { spouse: { id: 1 } }, fi: 0 },
      { fam: { spouse: { id: 2 } }, fi: 1 },
    ];
    const anchorCxList = [300, 400];
    assert.strictEqual(getAnchorForSingleFamily(famBlocks, anchorCxList), null);
  });
});
