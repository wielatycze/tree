const assert = require('assert');
const fs = require('fs');
const path = require('path');

function cssRule(css, selector) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`${escapedSelector}\\s*\\{([^}]*)\\}`).exec(css);
  return match ? match[1] : '';
}

describe('UI layout', function() {
  it('uses the Belarusian site name in the tab and toolbar', function() {
    const html = fs.readFileSync(path.join(process.cwd(), 'index.html'), 'utf8');

    assert.match(html, /<title>Вяляцічы і воласць<\/title>/);
    assert.match(html, /<h1>Вяляцічы і воласць<\/h1>/);
    assert.doesNotMatch(html, /Велятичи/);
    assert.doesNotMatch(html, /id="btn-home"|>Галоўная<\/button>/);
  });

  it('keeps the person detail panel out of the tree scroll viewport', function() {
    const css = fs.readFileSync(path.join(process.cwd(), 'tree.css'), 'utf8');
    const canvasWrap = cssRule(css, '#canvas-wrap');
    const detailPanel = cssRule(css, '#detail-panel');

    assert.match(canvasWrap, /min-height:\s*0/);
    assert.match(detailPanel, /position:\s*static/);
    assert.match(detailPanel, /flex-shrink:\s*0/);
    assert.doesNotMatch(detailPanel, /position:\s*fixed/);
  });

  it('right-aligns the tree person with a compact documents control', function() {
    const html = fs.readFileSync(path.join(process.cwd(), 'index.html'), 'utf8');
    const css = fs.readFileSync(path.join(process.cwd(), 'tree.css'), 'utf8');
    const treeContext = cssRule(css, '.tree-context');
    const documentsLink = cssRule(css, '.tree-documents-link');

    assert.match(treeContext, /margin-left:\s*auto/);
    assert.match(treeContext, /justify-content:\s*flex-end/);
    assert.match(documentsLink, /width:\s*30px/);
    assert.match(html, /id="tree-documents"[^>]*aria-label="Дакументы"[^>]*data-tooltip="Дакументы"/);
    assert.match(html, /<span aria-hidden="true">📚<\/span>/);
  });

  it('styles the person context menu as a compact action menu', function() {
    const html = fs.readFileSync(path.join(process.cwd(), 'index.html'), 'utf8');
    const css = fs.readFileSync(path.join(process.cwd(), 'tree.css'), 'utf8');
    const contextMenu = cssRule(css, '#person-context-menu');
    const contextAction = cssRule(css, '.person-context-action');

    assert.match(contextMenu, /width:\s*238px/);
    assert.match(contextMenu, /border-radius:\s*8px/);
    assert.match(contextAction, /min-height:\s*34px/);
    assert.match(contextAction, /justify-content:\s*space-between/);
    assert.match(html, /class="context-menu-arrow"[^>]*>→<\/span>/);
    assert.match(html, /id="context-compare"/);
    assert.match(html, /id="context-compare-label"[^>]*>Выбраць для параўнання<\/span>/);
  });

  it('uses tree selection for common-ancestor comparisons', function() {
    const html = fs.readFileSync(path.join(process.cwd(), 'index.html'), 'utf8');

    assert.doesNotMatch(html, /id="btn-common-ancestors"/);
    assert.doesNotMatch(html, /id="common-ancestor-overlay"/);
    assert.match(html, /id="context-compare"/);
    assert.match(html, /id="comparison-pick-status"/);
    assert.match(html, /id="comparison-pick-clear"[^>]*aria-label="Скасаваць выбар"/);
  });
});
