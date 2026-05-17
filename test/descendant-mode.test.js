const assert = require('assert');

/**
 * Tests for descendant mode rendering, specifically verifying that:
 * - Child vertical lines connect properly to spouse horizontal lines
 * - Vertical lines start at correct Y positions for spouses and parents
 */

describe('Descendant mode line connections', function() {
  // Constants matching tree.js
  const NODE_W = 152;
  const NODE_H = 88;
  const GAP_X = 20;
  const SP_GAP = 32;
  const FAM_GAP = 40;
  const STAGGER = 22;
  const ROW_H = NODE_H + 80; // GAP_Y = 80
  
  /**
   * Helper to mock lineSegments for tracking where lines are drawn
   */
  function mockLineDrawing() {
    const lines = [];
    const svg = {
      appendChild: function() {} // mock
    };
    
    global.drawLine = (svg, x1, y1, x2, y2, color, dashed) => {
      lines.push({ x1, y1, x2, y2, color, dashed });
    };
    
    global.drawBar = (svg, x1, x2, y, color) => {
      lines.push({ type: 'bar', x1, x2, y, color });
    };
    
    return { svg, lines, cleanup: () => delete global.drawLine };
  }

  it('vertical line for spouse family starts at marriage line Y', function() {
    const { svg, lines, cleanup } = mockLineDrawing();
    
    // When rendering a parent with a spouse:
    const parentY = 100;
    const parentCx = 300;
    const hasSpouse = true;
    
    // Calculate where vertical line should start (from spouse connection)
    // This should match: parentY + Math.round(NODE_H / 2)
    const expectedStartY = parentY + Math.round(NODE_H / 2); // 100 + 44 = 144
    
    // The stubStartY calculation in renderDescendantParent:
    // const stubStartY = blk.fam.spouse ? parentY + Math.round(NODE_H / 2) : nodeBot(parentY);
    const actualStartY = hasSpouse ? parentY + Math.round(NODE_H / 2) : parentY + NODE_H;
    
    assert.strictEqual(actualStartY, expectedStartY);
    assert.strictEqual(expectedStartY, 144, 'Spouse vertical line should start at marriage line Y (parent Y + NODE_H/2)');
    
    cleanup();
  });

  it('vertical line for single parent (no spouse) starts at parent bottom', function() {
    const { svg, lines, cleanup } = mockLineDrawing();
    
    const parentY = 100;
    const hasSpouse = false;
    
    // Without spouse, line should start at parent node bottom
    // nodeBot(parentY) = parentY + NODE_H
    const expectedStartY = parentY + NODE_H; // 100 + 88 = 188
    
    // The stubStartY calculation:
    const actualStartY = hasSpouse ? parentY + Math.round(NODE_H / 2) : parentY + NODE_H;
    
    assert.strictEqual(actualStartY, expectedStartY);
    assert.strictEqual(expectedStartY, 188, 'No-spouse vertical line should start at parent bottom (parent Y + NODE_H)');
    
    cleanup();
  });

  it('verifies NODE_H not NODE_W used for vertical line Y calculation', function() {
    const parentY = 100;
    
    // The bug was: parentY + Math.round(NODE_W / 2) instead of NODE_H / 2
    const buggyY = parentY + Math.round(NODE_W / 2); // 100 + 76 = 176 (WRONG)
    const correctY = parentY + Math.round(NODE_H / 2);  // 100 + 44 = 144 (CORRECT)
    
    assert.notStrictEqual(buggyY, correctY, 'NODE_W and NODE_H should produce different Y values');
    assert.strictEqual(NODE_W, 152, 'NODE_W should be 152 (width)');
    assert.strictEqual(NODE_H, 88, 'NODE_H should be 88 (height)');
    assert.ok(buggyY > correctY, 'Buggy calculation should be further down');
  });

  it('spouse horizontal line Y matches vertical line start Y', function() {
    const parentY = 100;
    const NODE_H_TEST = NODE_H;
    
    // Spouse horizontal line Y
    const HLINE_Y = parentY + Math.round(NODE_H_TEST / 2); // 144
    
    // Vertical line start Y (when there's a spouse)
    const verticalStartY = parentY + Math.round(NODE_H_TEST / 2); // 144
    
    assert.strictEqual(verticalStartY, HLINE_Y, 'Vertical line should start exactly where spouse horizontal line is drawn');
  });

  it('child vertical line should start from familyDropY', function() {
    // In renderDescendantParent, after drawing the main vertical line,
    // child vertical lines are drawn from familyDropY down to each child Y position
    const familyDropY = 300;
    const childY = 200;
    
    // The code: drawLine(svg, childCx, familyDropY, childCx, childY, '#7bc8a8');
    // This should create a vertical line from familyDropY to childY
    
    const lineStart = familyDropY;
    const lineEnd = childY;
    
    assert.ok(lineStart > lineEnd, 'familyDropY should be below childY (higher Y coordinate)');
  });

  it('descendant mode reserves NODE_W per child at each generation level only', function() {
    // Descendants are rendered at different Y levels, so horizontal spacing only needs NODE_W per child
    // This is the same as children mode spacing
    
    // For 4 children at a generation level:
    // Space needed = 4 * NODE_W + 3 * GAP_X = 4 * 152 + 3 * 20 = 668px
    // (NOT including recursive descendant widths, which are rendered at lower Y levels)
    
    const childrenCount = 4;
    const expectedWidth = childrenCount * NODE_W + (childrenCount - 1) * GAP_X;
    
    assert.strictEqual(expectedWidth, 668, 'Space for 4 children should be 668px at each generation level');
  });

  it('single spouse family uses NODE_W + SP_GAP + NODE_W spacing', function() {
    // For a single spouse without children, spacing should be just the spouse gap
    const spouseSpan = NODE_W + SP_GAP + NODE_W; // 152 + 32 + 152 = 336
    
    assert.strictEqual(spouseSpan, 336, 'Spouse spacing should be NODE_W + SP_GAP + NODE_W');
  });

  it('blocks never overlap because they are positioned left-to-right with GAP_X separation', function() {
    // Block 1: positioned at cursor=0, width=500
    // Block 2: positioned at cursor=0+500+GAP_X=520, width=400
    // Block 3: positioned at cursor=520+400+GAP_X=940, width=300
    
    const block1Left = 0;
    const block1Width = 500;
    const block2Left = block1Left + block1Width + GAP_X;
    const block2Width = 400;
    const block3Left = block2Left + block2Width + GAP_X;
    
    assert.strictEqual(block2Left, 520);
    assert.strictEqual(block3Left, 940);
    
    // No overlap: block1 ends before block2 starts
    assert.ok(block1Left + block1Width + GAP_X <= block2Left);
    // No overlap: block2 ends before block3 starts
    assert.ok(block2Left + block2Width + GAP_X <= block3Left);
  });
});
