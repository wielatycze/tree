const assert = require('assert');
const fs = require('fs');
const path = require('path');

function cssRule(css, selector) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`${escapedSelector}\\s*\\{([^}]*)\\}`).exec(css);
  return match ? match[1] : '';
}

describe('UI layout', function() {
  it('keeps the person detail panel out of the tree scroll viewport', function() {
    const css = fs.readFileSync(path.join(process.cwd(), 'tree.css'), 'utf8');
    const canvasWrap = cssRule(css, '#canvas-wrap');
    const detailPanel = cssRule(css, '#detail-panel');

    assert.match(canvasWrap, /min-height:\s*0/);
    assert.match(detailPanel, /position:\s*static/);
    assert.match(detailPanel, /flex-shrink:\s*0/);
    assert.doesNotMatch(detailPanel, /position:\s*fixed/);
  });
});
