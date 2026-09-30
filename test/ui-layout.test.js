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

    assert.match(html, /<html lang="be">/);
    assert.match(html, /<title>Вяляцічы і воласць<\/title>/);
    assert.match(html, /<h1>Вяляцічы і воласць<\/h1>/);
    assert.match(html, /id="search-input" placeholder="Пошук"/);
    assert.match(html, /http-equiv="Content-Security-Policy"/);
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
    const css = fs.readFileSync(path.join(process.cwd(), 'tree.css'), 'utf8');
    const treeStage = cssRule(css, '#tree-stage');
    const comparisonSummary = cssRule(css, '#comparison-summary');

    assert.doesNotMatch(html, /id="btn-common-ancestors"/);
    assert.doesNotMatch(html, /id="common-ancestor-overlay"/);
    assert.match(html, /id="context-compare"/);
    assert.match(html, /id="comparison-pick-status"/);
    assert.match(html, /id="comparison-pick-clear"[^>]*aria-label="Скасаваць выбар"/);
    assert.match(html, /id="tree-stage"[\s\S]*id="comparison-summary"[\s\S]*id="canvas-wrap"/);
    assert.match(treeStage, /display:\s*flex/);
    assert.match(comparisonSummary, /width:\s*280px/);
  });

  it('offers an optional generation guide toggle for normal trees', function() {
    const html = fs.readFileSync(path.join(process.cwd(), 'index.html'), 'utf8');
    const css = fs.readFileSync(path.join(process.cwd(), 'tree.css'), 'utf8');

    assert.match(html, /id="tree-view-options-control"/);
    assert.match(html, /id="descendant-limit-control"[\s\S]*?<span>Пакаленні<\/span>/);
    assert.match(html, /<details class="tree-view-options" id="tree-view-options-control">[\s\S]*?id="descendant-limit-control"/);
    assert.match(html, /<summary>Выгляд<\/summary>[\s\S]*?id="generation-guides-toggle" type="checkbox"[\s\S]*?<span>Лініі пакаленняў<\/span>/);
    assert.match(html, /id="relationship-labels-toggle" type="checkbox"[\s\S]*?<span>Сваяцтва<\/span>/);
    assert.doesNotMatch(html, /class="generation-guides-icon"/);
    assert.match(css, /\.tree-view-options-menu\s*\{/);
    assert.match(css, /\.node-relation\s*\{[\s\S]*?border-top:/);
    assert.match(css, /\.node\.is-root\s*\{[\s\S]*?border:\s*2px solid #6d6964;[\s\S]*?background:\s*#fbfaf8;[\s\S]*?box-shadow:/);
    assert.match(css, /\.generation-limit\s*\{[\s\S]*?border:\s*1px solid #d0cdc8;[\s\S]*?border-radius:\s*7px;[\s\S]*?overflow:\s*hidden;/);
    assert.match(css, /\.generation-limit-btn\s*\{[\s\S]*?border-right:\s*1px solid #d0cdc8;/);
    assert.match(css, /\.tree-generation-band\s*\{/);
    assert.match(css, /\.tree-generation-label\s*\{/);
  });

  it('uses one ancestors-only option instead of two mode buttons', function() {
    const html = fs.readFileSync(path.join(process.cwd(), 'index.html'), 'utf8');
    const css = fs.readFileSync(path.join(process.cwd(), 'tree.css'), 'utf8');

    assert.match(html, /id="ancestors-only-toggle" type="checkbox"/);
    assert.match(html, /<span>Толькі продкі<\/span>/);
    assert.doesNotMatch(html, /class="mode-btn/);
    assert.match(css, /\.ancestors-only-option\s*\{/);
  });

  it('links to a separate, incrementally rendered people directory', function() {
    const treeHtml = fs.readFileSync(path.join(process.cwd(), 'index.html'), 'utf8');
    const peopleHtml = fs.readFileSync(path.join(process.cwd(), 'people.html'), 'utf8');
    const peopleJs = fs.readFileSync(path.join(process.cwd(), 'people.js'), 'utf8');
    const peopleCss = fs.readFileSync(path.join(process.cwd(), 'people.css'), 'utf8');

    assert.match(treeHtml, /class="btn helper-page-link"[^>]*href="people\.html"[^>]*aria-label="Спіс асоб"/);
    assert.match(treeHtml, /<div id="toolbar">\s*<a class="btn helper-page-link"[\s\S]*?<\/a>\s*<h1>Вяляцічы і воласць<\/h1>/);
    assert.match(peopleHtml, /<table id="people-table">/);
    assert.match(peopleHtml, /http-equiv="Content-Security-Policy"/);
    assert.match(peopleHtml, /data-sort="birth"[\s\S]*data-sort="marriage"[\s\S]*data-sort="death"/);
    ['surname', 'given', 'patronymic', 'place', 'id'].forEach(field => {
      assert.match(peopleHtml, new RegExp(`data-filter="${field}"`));
    });
    ['birthFrom', 'birthTo', 'marriageFrom', 'marriageTo', 'deathFrom', 'deathTo'].forEach(field => {
      assert.match(peopleHtml, new RegExp(`type="range" data-filter="${field}"`));
    });
    ['surname', 'given', 'patronymic', 'birth', 'marriage', 'death', 'place', 'id'].forEach(field => {
      assert.match(peopleHtml, new RegExp(`data-sort="${field}"`));
    });
    assert.match(peopleJs, /const PAGE_SIZE = 200/);
    assert.match(peopleJs, /function setupDateRanges\(\)/);
    assert.match(peopleJs, /Math\.min\(\.\.\.years\)/);
    assert.match(peopleJs, /Math\.max\(\.\.\.years\)/);
    assert.match(peopleJs, /visibleRows\.slice\(renderedCount, renderedCount \+ PAGE_SIZE\)/);
    assert.match(peopleJs, /tableWrap\.addEventListener\('scroll'/);
    assert.match(peopleCss, /#people-table-wrap\s*\{[^}]*overflow:\s*auto/s);
    assert.match(peopleCss, /\.column-headings th\s*\{[^}]*position:\s*sticky/s);
    assert.match(peopleCss, /\.column-filters th\s*\{[^}]*position:\s*sticky/s);
  });
});
