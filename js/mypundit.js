/* =========================================================
   Mypundit 공통 스크립트
   - 구성원 탭(주신고인/배우자/부양가족) : 개인정보에 입력한 이름을 따라옴
   - 워크북 표 생성(행 추가/삭제, 자동 계산)
   - 연도 탭, 신고 유형 미리보기 토글, 작성 안내 접기
   ========================================================= */
window.MP = (function () {
  'use strict';
  var KEY = 'mypundit-people';

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  /* ---------- 구성원 ---------- */
  function people() {
    var s = null; try { s = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) {}
    s = s || { main: {}, spouse: {}, deps: [] };
    function nm(o) { return ((o && o.last || '') + (o && o.first || '')).trim(); }
    var list = [{ id: 'main', role: '주신고인', name: nm(s.main) }, { id: 'spouse', role: '배우자', name: nm(s.spouse) }];
    (s.deps || []).forEach(function (d, i) { list.push({ id: 'dep' + (i + 1), role: '부양가족 ' + (i + 1), name: (nm(d) || d.name || '').trim() }); });
    return list;
  }
  function label(p) { return p.name ? p.role + ' · ' + p.name : p.role; }

  /* root 안의 .ptabs/.panes 를 구성원 목록으로 채운다. buildPane(paneEl, person) 이 내용을 만든다. */
  function personTabs(root, buildPane, opts) {
    opts = opts || {};
    var bar = root.querySelector('.ptabs'), panes = root.querySelector('.panes'), sig = '';
    function activate(id) {
      bar.querySelectorAll('[data-tab]').forEach(function (b) { b.classList.toggle('on', b.dataset.tab === id); });
      panes.querySelectorAll(':scope > [data-pane]').forEach(function (p) { p.hidden = p.dataset.pane !== id; });
      if (opts.onActivate) opts.onActivate(id);
    }
    function build(force) {
      var list = people(), s2 = (opts.sig ? opts.sig() : '') + JSON.stringify(list);
      if (!force && s2 === sig) return;
      var on = bar.querySelector('.on'), current = on ? on.dataset.tab : 'main', kept = {};
      panes.querySelectorAll(':scope > [data-pane]').forEach(function (p) { kept[p.dataset.pane] = p; });
      bar.innerHTML = ''; panes.innerHTML = '';
      list.forEach(function (p) {
        var b = document.createElement('button'); b.type = 'button'; b.dataset.tab = p.id; b.textContent = label(p); bar.appendChild(b);
        var pane = (!force && kept[p.id]) || null;
        if (!pane) { pane = document.createElement('div'); pane.dataset.pane = p.id; buildPane(pane, p); }
        panes.appendChild(pane);
      });
      sig = s2;
      activate(list.some(function (p) { return p.id === current; }) ? current : 'main');
    }
    bar.addEventListener('click', function (e) { var b = e.target.closest('[data-tab]'); if (b) activate(b.dataset.tab); });
    build();
    window.addEventListener('hashchange', function () { build(); });
    window.addEventListener('storage', function () { build(); });
    window.addEventListener('pageshow', function () { build(); });
    return { build: build, activate: activate, current: function () { return panes.querySelector(':scope > [data-pane]:not([hidden])'); } };
  }

  /* ---------- 표 ---------- */
  function cellHTML(c) {
    var k = ' data-k="' + c.k + '"';
    if (c.type === 'select') return '<div class="sel"><select' + k + '><option value="">' + esc(c.ph || '선택') + '</option>' + (c.opts || []).map(function (o) { return '<option>' + esc(o) + '</option>'; }).join('') + '</select></div>';
    if (c.type === 'calc' || c.type === 'ro') return '<input type="text"' + k + ' readonly tabindex="-1" class="ro" placeholder="' + esc(c.ph || (c.type === 'calc' ? '자동 계산' : '')) + '">';
    if (c.type === 'date') return '<input type="text"' + k + ' placeholder="' + esc(c.ph || '연도. 월. 일') + '">';
    return '<input type="text"' + k + ' placeholder="' + esc(c.ph || '') + '">';
  }
  function tableHTML(spec) {
    var groups = [];
    spec.cols.forEach(function (x) { var g = groups[groups.length - 1]; if (g && g.name === (x.g || '')) g.n++; else groups.push({ name: x.g || '', n: 1 }); });
    var hasGroups = groups.some(function (g) { return g.name; });
    var h = '<div class="acct-wrap"><table class="acct"><thead>';
    if (hasGroups) h += '<tr><th class="rowchk plain"></th>' + groups.map(function (g) { return '<th colspan="' + g.n + '"' + (g.name ? '' : ' class="plain"') + '>' + esc(g.name) + '</th>'; }).join('') + '</tr>';
    h += '<tr><th class="rowchk"></th>' + spec.cols.map(function (x) { return '<th' + (x.w ? ' style="min-width:' + x.w + 'px"' : '') + '>' + esc(x.l) + (x.sub ? '<small>' + esc(x.sub) + '</small>' : '') + '</th>'; }).join('') + '</tr></thead><tbody></tbody></table></div>';
    h += '<div class="acct-tools"><button type="button" class="btn-sm" data-add>' + esc(spec.addLabel || '행 추가') + '</button><button type="button" class="btn-sm" data-del>' + esc(spec.delLabel || '선택 행 삭제') + '</button>' + (spec.tools || '') + '</div>';
    if (spec.hint) h += '<p class="acct-hint">' + esc(spec.hint) + '</p>';
    return h;
  }
  function rowHTML(spec) {
    return '<td class="rowchk"><input type="checkbox"></td>' + spec.cols.map(function (x) { return '<td' + (x.type === 'num' || x.type === 'calc' ? ' class="num"' : '') + (x.w ? ' style="min-width:' + x.w + 'px"' : '') + '>' + cellHTML(x) + '</td>'; }).join('');
  }
  function rowData(tr) { var o = {}; tr.querySelectorAll('[data-k]').forEach(function (el) { o[el.dataset.k] = el.value; }); return o; }
  function num(v) { var n = parseFloat(String(v == null ? '' : v).replace(/[^0-9.\-]/g, '')); return isNaN(n) ? 0 : n; }
  function fmt(n) { if (n === null || n === undefined || n === '' || isNaN(n)) return ''; return Number(n).toLocaleString('ko-KR', { maximumFractionDigits: 2 }); }
  function recalc(tr, spec) {
    if (!spec.calc) return;
    var r = spec.calc(rowData(tr), num) || {};
    Object.keys(r).forEach(function (k) { var el = tr.querySelector('[data-k="' + k + '"]'); if (el) el.value = (r[k] === '' || r[k] === null || r[k] === undefined) ? '' : fmt(r[k]); });
  }
  function addRow(tbody, spec, data) {
    var tr = document.createElement('tr'); tr.innerHTML = rowHTML(spec);
    if (data) { Object.keys(data).forEach(function (k) { var el = tr.querySelector('[data-k="' + k + '"]'); if (el && data[k] != null) el.value = data[k]; }); tr.classList.add('pulled'); }
    tbody.appendChild(tr); recalc(tr, spec); return tr;
  }
  /* container 에 spec 대로 표를 만든다. 반환값으로 행 추가/읽기 가능 */
  function grid(container, spec, nrows) {
    container.innerHTML = tableHTML(spec);
    var tb = container.querySelector('tbody');
    for (var i = 0; i < (nrows == null ? 3 : nrows); i++) addRow(tb, spec);
    container.addEventListener('click', function (e) {
      var t = e.target;
      if (t.hasAttribute('data-add')) addRow(tb, spec);
      if (t.hasAttribute('data-del')) {
        var rows = Array.prototype.filter.call(tb.querySelectorAll('tr'), function (tr) { return tr.querySelector('td.rowchk input').checked; });
        if (!rows.length) { var all = tb.querySelectorAll('tr'); if (all.length > 1) rows = [all[all.length - 1]]; }
        rows.forEach(function (r) { r.remove(); });
      }
    });
    container.addEventListener('input', function (e) { var tr = e.target.closest('tr'); if (tr) recalc(tr, spec); });
    return { tbody: tb, add: function (d) { return addRow(tb, spec, d); }, rows: function () { return Array.prototype.map.call(tb.querySelectorAll('tr'), rowData); }, spec: spec };
  }

  /* ---------- 연도 탭 ---------- */
  function yearTabs(pane, years, current, buildYear) {
    var bar = document.createElement('div'); bar.className = 'ytabs';
    var box = document.createElement('div'); box.className = 'ybox';
    years.forEach(function (y) {
      var b = document.createElement('button'); b.type = 'button'; b.dataset.year = y; b.textContent = y + '년'; if (y === current) b.classList.add('on'); bar.appendChild(b);
      var blk = document.createElement('div'); blk.dataset.year = y; blk.hidden = (y !== current); buildYear(blk, y); box.appendChild(blk);
    });
    bar.addEventListener('click', function (e) {
      var yb = e.target.closest('[data-year]'); if (!yb) return;
      bar.querySelectorAll('[data-year]').forEach(function (b) { b.classList.toggle('on', b === yb); });
      box.querySelectorAll(':scope > [data-year]').forEach(function (x) { x.hidden = x.dataset.year !== yb.dataset.year; });
    });
    pane.appendChild(bar); pane.appendChild(box);
    return box;
  }

  /* ---------- 기타 ---------- */
  function seg(root, onChange) {
    var s = root.querySelector('.seg'); if (!s) return;
    s.addEventListener('click', function (e) {
      var b = e.target.closest('[data-mode]'); if (!b || b.classList.contains('on')) return;
      s.querySelectorAll('[data-mode]').forEach(function (x) { x.classList.toggle('on', x === b); });
      onChange(b.dataset.mode);
    });
  }
  function notes(root) { var n = root.querySelector('[data-notes]'); if (n) n.querySelector('.nh').addEventListener('click', function () { n.classList.toggle('open'); }); }

  /* 접이식 섹션([data-fold]) 공통 토글: 머리글 클릭으로 접고 펼침 */
  function bindFolds() {
    document.querySelectorAll('[data-fold]').forEach(function (fold) {
      if (fold.dataset.foldBound) return;
      fold.dataset.foldBound = '1';
      var head = fold.querySelector('.fold-head'); if (!head) return;
      head.addEventListener('click', function () {
        fold.classList.toggle('open');
        var t = fold.querySelector('.tgl-txt'); if (t) t.textContent = fold.classList.contains('open') ? '접기' : '펼치기';
      });
    });
  }
  /* 왼쪽 메뉴 접기/펼치기 (상태는 브라우저에 기억) */
  function bindSide() {
    var wrap = document.querySelector('.wrap'), btn = document.querySelector('.side-toggle');
    if (!wrap || !btn) return;
    var K = 'mypundit-side';
    try { if (localStorage.getItem(K) === 'collapsed') wrap.classList.add('side-collapsed'); } catch (e) {}
    btn.addEventListener('click', function () {
      wrap.classList.toggle('side-collapsed');
      try { localStorage.setItem(K, wrap.classList.contains('side-collapsed') ? 'collapsed' : 'open'); } catch (e) {}
    });
  }
  /* '해당 사항 없음' 체크: 그 항목의 입력 영역을 접고, 왼쪽 항목 목록에 '해당 없음'을 표시 */
  var NA_KEY = 'mypundit-na';
  function naSet() { try { return JSON.parse(localStorage.getItem(NA_KEY) || '{}') || {}; } catch (e) { return {}; } }
  function naSave(o) { try { localStorage.setItem(NA_KEY, JSON.stringify(o)); } catch (e) {} }
  function markTabs() {
    var set = naSet();
    document.querySelectorAll('.tabs a[data-ws]').forEach(function (a) {
      var on = !!set[a.dataset.ws], chk = a.querySelector('.chk'), tag = a.querySelector('.na-tag');
      a.classList.toggle('na', on);
      if (chk) chk.classList.toggle('done', on || chk.dataset.base === '1');
      if (on && !tag) { tag = document.createElement('em'); tag.className = 'na-tag'; tag.textContent = '해당 없음'; a.firstElementChild.appendChild(tag); }
      if (!on && tag) tag.remove();
    });
  }
  function bindNA() {
    document.querySelectorAll('.tabs a[data-ws] .chk.done').forEach(function (c) { c.dataset.base = '1'; });
    var bar = document.querySelector('[data-na]');
    if (bar) {
      var key = bar.dataset.na, chk = bar.querySelector('[data-na-chk]'), note = bar.querySelector('.na-note');
      var bodies = []; for (var el = bar.nextElementSibling; el; el = el.nextElementSibling) if (el.tagName !== 'SCRIPT' && el.tagName !== 'TEMPLATE') bodies.push(el);
      function apply(save) {
        var on = chk.checked;
        bar.classList.toggle('on', on); note.hidden = !on;
        bodies.forEach(function (b) { b.hidden = on; });
        if (save) { var set = naSet(); if (on) set[key] = true; else delete set[key]; naSave(set); }
        markTabs();
      }
      chk.checked = !!naSet()[key];
      chk.addEventListener('change', function () { apply(true); });
      apply(false);
    } else markTabs();
    window.addEventListener('storage', markTabs);
  }
  /* 금액 칸 자동 쉼표: 금액 입력(.unit, 표의 숫자 칸, 금융계좌 잔액·소득, 증여 가액)에 천 단위 구분 */
  var MONEY_SEL = '.unit input:not([readonly]), td.num input:not([readonly]), input[data-g="amount"], input[data-f="max"], input[data-f="dec"], input[data-f="int"], input[data-f="div"], input[data-f="intw"], input[data-f="divw"]';
  function fmtMoney(el) {
    var v = el.value; if (!v) return;
    var neg = /^\s*-/.test(v), parts = v.replace(/[^0-9.]/g, '').split('.');
    var whole = parts[0].replace(/^0+(?=\d)/, ''), dec = parts.length > 1 ? '.' + parts.slice(1).join('').slice(0, 4) : '';
    if (!whole && !dec) { el.value = neg ? '-' : ''; return; }
    var out = (neg ? '-' : '') + (whole ? whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',') : '0') + dec;
    if (out !== v) { el.value = out; try { el.setSelectionRange(out.length, out.length); } catch (e) {} }
  }
  function bindMoney() {
    document.addEventListener('input', function (e) { var el = e.target; if (el && el.matches && el.matches(MONEY_SEL)) fmtMoney(el); });
    document.addEventListener('blur', function (e) { var el = e.target; if (el && el.matches && el.matches(MONEY_SEL)) fmtMoney(el); }, true);
  }
  /* 통화 선택에서 '기타'를 고르면 같은 자리에 직접 입력 칸을 연다 (금융계좌는 화면이 직접 처리) */
  function bindCurOther() {
    document.addEventListener('change', function (e) {
      var s = e.target; if (!s || !s.matches || !s.matches('select[data-cur], select[data-g="cur"], select[data-k="cur"]')) return;
      var wrap = s.closest('.sel'); if (!wrap) return;
      var inp = wrap.querySelector('.cur-other');
      if (s.value === '기타') {
        if (!inp) {
          inp = document.createElement('input'); inp.type = 'text'; inp.className = 'cur-other'; inp.placeholder = '통화 코드 직접 입력 (예: TWD)'; inp.maxLength = 12;
          var key = s.hasAttribute('data-g') ? 'data-g' : (s.hasAttribute('data-k') ? 'data-k' : 'data-cur');
          inp.setAttribute(key, s.getAttribute(key) + 'Other');
          inp.addEventListener('blur', function () { if (!inp.value.trim()) { wrap.classList.remove('other'); inp.remove(); s.value = ''; s.dispatchEvent(new Event('change', { bubbles: true })); } });
          wrap.appendChild(inp);
        }
        wrap.classList.add('other'); inp.focus();
      } else if (inp) { wrap.classList.remove('other'); inp.remove(); }
    });
  }
  function onReady() { bindFolds(); bindSide(); bindNA(); bindMoney(); bindCurOther(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', onReady); else onReady();

  return { KEY: KEY, esc: esc, people: people, label: label, personTabs: personTabs, grid: grid, addRow: addRow, rowData: rowData, num: num, fmt: fmt, yearTabs: yearTabs, seg: seg, notes: notes };
})();
