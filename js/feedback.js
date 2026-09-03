/* =========================================================
   수정사항 남기기 도구 (feedback.js)
   - 화면의 아무 요소나 우클릭 → 수정 요청 메모 작성
   - 기본(로컬 모드): 메모는 브라우저(localStorage)에만 저장
   - 공유 모드: window.FB_CONFIG = { sync: 'Apps Script 웹앱 URL' } 이 있으면
     메모를 서버(Google 시트)에 저장하고, 모든 검토자가 같은 메모를 봅니다.
     내 메모는 주황, 다른 사람 메모는 파란 뱃지. 이름은 처음 한 번만 묻습니다.
   - 오른쪽 아래 패널에서 전체 복사 / 파일 저장 (/ 로컬 모드: 불러오기)
   - Shift + 우클릭 : 브라우저 기본 메뉴
   ========================================================= */
(function () {
  'use strict';

  var KEY = 'pundit-feedback-v1';
  var CFG = window.FB_CONFIG || {};
  var SYNC = CFG.sync || '';
  var PAGE = decodeURIComponent(location.pathname.split('/').pop() || 'index.html');
  var TITLES = {
    'm_002.html': '대시보드',
    's_001_1.html': 'Step 1. 견적 확인 및 계약금 납부',
    's_001_2_1.html': 'Step 2. 개인정보',
    's_001_2_2.html': 'Step 2. 미국 출입국 내역',
    's_001_2_3.html': 'Step 2. 금융계좌 정보',
    's_001_2_4.html': 'Step 2. 임대부동산 자산',
    's_001_2_5.html': 'Step 2. 주식 & 코인거래 내역',
    's_001_2_6.html': 'Step 2. 증여신고',
    's_001_2_9.html': 'Step 2. 부동산 매매',
    's_001_2_7.html': 'Step 2. PFIC',
    's_001_2_8.html': 'Step 2. 사유서 내용',
    's_001_3.html': 'Step 3. 자료 업로드'
  };
  var PAGE_ORDER = Object.keys(TITLES);

  /* ---------- 저장소 ---------- */
  function load() { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } }
  function save() { if (SYNC) return; try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) { alert('저장에 실패했습니다: ' + e.message); } }
  var CKEY = KEY + ':cache';
  function loadCache() { try { return JSON.parse(localStorage.getItem(CKEY)) || {}; } catch (e) { return {}; } }
  function saveCache(o) { try { localStorage.setItem(CKEY, JSON.stringify(o)); } catch (e) {} }
  var db = SYNC ? loadCache() : load();
  /* #fb=<id> 로 들어오면 그 메모 위치로 이동해 연다 (전체 보기에서 클릭한 경우) */
  var pendingFocus = (location.hash.match(/^#fb=(.+)$/) || [])[1] || '';
  if (pendingFocus) { pendingFocus = decodeURIComponent(pendingFocus); try { history.replaceState(null, '', location.pathname + location.search); } catch (e) {} }
  var settings = { mode: localStorage.getItem(KEY + ':mode') !== 'off', open: localStorage.getItem(KEY + ':open') !== 'closed' };
  function notes() { return db[PAGE] || (db[PAGE] = []); }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
  function now() { var d = new Date(); function p(n) { return (n < 10 ? '0' : '') + n; } return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes()); }
  function fdate(v) { if (!v) return ''; var s = String(v); if (/^\d{4}-\d{2}-\d{2}T/.test(s)) { var d = new Date(s); if (!isNaN(d)) { function p(n) { return (n < 10 ? '0' : '') + n; } return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes()); } } return s; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  /* ---------- 작성자 (공유 모드) ---------- */
  var AKEY = KEY + ':author';
  function author(force) {
    var a = ''; try { a = localStorage.getItem(AKEY) || ''; } catch (e) {}
    if (!a || force) {
      a = (prompt('메모에 표시할 이름을 입력해 주세요. (예: 홍길동 / 개발사 김OO)', a || '') || '').trim() || a || '익명';
      try { localStorage.setItem(AKEY, a); } catch (e) {}
    }
    return a;
  }
  function me() { try { return localStorage.getItem(AKEY) || ''; } catch (e) { return ''; } }

  /* ---------- 서버 동기화 (공유 모드) ---------- */
  var syncState = { ok: false, loading: false, err: '', at: '' };
  function syncLoad(silent) {
    if (!SYNC) return Promise.resolve();
    syncState.loading = true; var dot = panel && panel.querySelector('.sync .dot'); if (dot) dot.className = 'dot busy';
    return fetch(SYNC + (SYNC.indexOf('?') < 0 ? '?' : '&') + 'action=list&_=' + Date.now(), { method: 'GET', redirect: 'follow' })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (!j || !j.ok) throw new Error(j && j.error || '응답 오류');
        var next = {};
        (j.memos || []).forEach(function (m) { if (m.deleted) return; (next[m.page] = next[m.page] || []).push(m); });
        Object.keys(next).forEach(function (p) { next[p].sort(function (a, b) { return String(a.created).localeCompare(String(b.created)); }); });
        db = next; saveCache(next); syncState.ok = true; syncState.err = ''; syncState.loading = false; syncState.at = now().slice(11);
        refresh(); if (modal) renderModal();
      })
      .catch(function (e) {
        syncState.ok = false; syncState.err = e.message || String(e); syncState.loading = false;
        if (!silent) toast('공유 서버에 연결하지 못했습니다: ' + syncState.err);
        refresh();
      });
  }
  function syncPost(payload) {
    return fetch(SYNC, { method: 'POST', redirect: 'follow', body: JSON.stringify(payload) })
      .then(function (r) { return r.json(); })
      .then(function (j) { if (!j || !j.ok) throw new Error(j && j.error || '저장 실패'); return j; });
  }
  if (SYNC) {
    syncLoad(false);
    setInterval(function () { if (!document.hidden && !pop) syncLoad(true); }, 30000);
    document.addEventListener('visibilitychange', function () { if (!document.hidden) syncLoad(true); });
  }

  /* ---------- 요소 식별 ---------- */
  function pathOf(el) {
    var parts = [];
    while (el && el.nodeType === 1 && el !== document.body) {
      if (el.id) { parts.unshift('#' + el.id); break; }
      var s = el.tagName.toLowerCase();
      var p = el.parentElement;
      if (p) {
        var sib = Array.prototype.filter.call(p.children, function (c) { return c.tagName === el.tagName; });
        if (sib.length > 1) s += ':nth-of-type(' + (sib.indexOf(el) + 1) + ')';
      }
      parts.unshift(s);
      el = p;
    }
    return parts.join(' > ');
  }
  function findByPath(path) { try { return document.querySelector(path); } catch (e) { return null; } }

  function labelOf(el) {
    var t = '';
    if (el.matches('input,textarea,select')) {
      var v = el.tagName === 'SELECT' ? (el.options[el.selectedIndex] || {}).text : (el.placeholder || el.value);
      var f = el.closest('.field, .year-select, .unit, .date, .sel');
      var l = f && f.querySelector('.lbl, label');
      t = (l ? l.innerText.trim().split('\n')[0] + ' ' : '') + '입력칸' + (v ? ' ("' + v + '")' : '');
    } else if (el.tagName === 'IMG') {
      t = '이미지 (' + (el.alt || el.src.split('/').pop()) + ')';
    } else {
      t = (el.innerText || '').trim().replace(/\s+/g, ' ');
      if (t.length > 40) t = t.slice(0, 40) + '…';
      if (t) t = '"' + t + '"';
    }
    var ctx = '';
    var sec = el.closest('.sidebar, .topbar, .footer, .statusbar, .tabs, .tab-btns, .btns, .steps, .panel, .card, .upload');
    if (sec) {
      if (sec.classList.contains('sidebar')) ctx = '왼쪽 메뉴';
      else if (sec.classList.contains('topbar')) ctx = '상단바';
      else if (sec.classList.contains('footer')) ctx = '푸터';
      else if (sec.classList.contains('statusbar')) ctx = '현재 단계 바';
      else if (sec.classList.contains('tabs')) ctx = '워크시트 탭 목록';
      else if (sec.classList.contains('tab-btns') || sec.classList.contains('btns')) ctx = '버튼 영역';
      else if (sec.classList.contains('steps')) ctx = '진행사항 스텝';
      else { var h = sec.querySelector('.card-title, .panel-title, h2, h3'); if (h) ctx = h.innerText.trim().split('\n')[0]; }
    }
    return (ctx ? ctx + ' > ' : '') + (t || '<' + el.tagName.toLowerCase() + '>');
  }

  /* ---------- 스타일 ---------- */
  var css = '\
  .fb-hover{outline:2px dashed #00459b !important;outline-offset:2px;cursor:context-menu}\
  .fb-marked{outline:2px solid #e8562a !important;outline-offset:2px}\
  .fb-marked.fb-theirs{outline-color:#00459b !important}\
  .fb-badge{position:absolute;z-index:99990;min-width:22px;height:22px;padding:0 6px;border-radius:11px;background:#e8562a;color:#fff;font:700 12px/22px Pretendard,sans-serif;text-align:center;box-shadow:0 2px 6px rgba(0,0,0,.25);cursor:pointer;transform:translate(50%,-50%);pointer-events:auto}\
  .fb-badge:hover{background:#c8401a}\
  .fb-badge.theirs{background:#00459b}\
  .fb-badge.theirs:hover{background:#003a82}\
  .fb-pop{position:fixed;z-index:99999;width:360px;background:#fff;border-radius:12px;box-shadow:0 10px 40px rgba(0,0,0,.25);font-family:Pretendard,sans-serif;font-size:14px;color:#222;overflow:hidden}\
  .fb-pop .h{background:#00459b;color:#fff;padding:10px 14px;font-weight:600;display:flex;justify-content:space-between;align-items:center}\
  .fb-pop .h span{opacity:.8;font-weight:400;font-size:12px}\
  .fb-pop .b{padding:12px 14px}\
  .fb-pop .where{font-size:12px;color:#666;background:#f4f6fa;border-radius:6px;padding:8px 10px;margin-bottom:10px;word-break:break-all}\
  .fb-pop .who{font-size:12px;color:#00459b;margin:-4px 0 8px}\
  .fb-pop textarea{width:100%;height:110px;border:1px solid #ddd;border-radius:6px;padding:10px;font:14px/1.5 Pretendard,sans-serif;resize:vertical;box-sizing:border-box}\
  .fb-pop textarea:focus{outline:none;border-color:#00459b}\
  .fb-pop .f{display:flex;gap:6px;margin-top:10px;justify-content:flex-end}\
  .fb-btn{display:inline-flex;align-items:center;justify-content:center;height:32px;padding:0 12px;border-radius:6px;border:1px solid #ddd;background:#fff;color:#333;font:13px Pretendard,sans-serif;cursor:pointer;white-space:nowrap}\
  .fb-btn:hover{background:#f4f4f4}\
  .fb-btn.p{background:#00459b;border-color:#00459b;color:#fff}\
  .fb-btn.p:hover{background:#003a82}\
  .fb-btn.d{color:#c8401a}\
  .fb-btn.mr{margin-right:auto}\
  .fb-btn:disabled{opacity:.5;cursor:default}\
  .fb-panel{position:fixed;right:20px;bottom:20px;z-index:99995;width:380px;background:#fff;border-radius:14px;box-shadow:0 10px 40px rgba(0,0,0,.22);font-family:Pretendard,sans-serif;font-size:14px;color:#222;overflow:hidden}\
  .fb-panel .ph{background:#1a1a1a;color:#fff;padding:12px 16px;display:flex;align-items:center;gap:10px;cursor:pointer;user-select:none}\
  .fb-panel .ph b{font-size:15px}\
  .fb-panel .ph .cnt{background:#e8562a;border-radius:10px;padding:1px 8px;font-size:12px;font-weight:700}\
  .fb-panel .ph .tg{margin-left:auto;font-size:12px;opacity:.8}\
  .fb-panel .pb{display:none}\
  .fb-panel.open .pb{display:block}\
  .fb-panel .mode{display:flex;align-items:center;gap:8px;padding:10px 16px;background:#f4f6fa;font-size:13px;color:#444}\
  .fb-panel .mode label{display:flex;align-items:center;gap:6px;cursor:pointer;font-weight:600;color:#222}\
  .fb-panel .mode input{width:16px;height:16px;accent-color:#00459b;margin:0}\
  .fb-panel .hint{font-size:12px;color:#777;margin-left:auto}\
  .fb-panel .sync{display:flex;align-items:center;gap:8px;padding:8px 16px;font-size:12px;color:#555;border-bottom:1px solid #eee}\
  .fb-panel .sync .dot{width:8px;height:8px;border-radius:50%;background:#2e7d32;flex:none}\
  .fb-panel .sync .dot.off{background:#c8401a}\
  .fb-panel .sync .dot.busy{background:none;border:2px solid #ccc;border-top-color:#00459b;animation:fbspin .8s linear infinite}\
  @keyframes fbspin{to{transform:rotate(360deg)}}\
  .fb-panel .other{cursor:pointer;color:#00459b}\
  .fb-panel .other:hover{text-decoration:underline}\
  .fb-modal{position:fixed;inset:0;z-index:100001;background:rgba(10,22,45,.5);display:flex;align-items:center;justify-content:center;font-family:Pretendard,sans-serif;color:#222}\
  .fb-mbox{width:min(980px,94vw);height:min(88vh,920px);background:#fff;border-radius:16px;box-shadow:0 24px 70px rgba(0,0,0,.35);display:flex;flex-direction:column;overflow:hidden}\
  .fb-mh{display:flex;align-items:center;gap:12px;padding:16px 22px;border-bottom:1px solid #eee;flex:none}\
  .fb-mh b{font-size:18px}\
  .fb-mh .cnt{background:#e8562a;color:#fff;border-radius:10px;padding:2px 10px;font-size:13px;font-weight:700}\
  .fb-mf{display:flex;align-items:center;gap:12px;margin-left:auto}\
  .fb-mf input[type=search]{height:36px;border:1px solid #ddd;border-radius:8px;padding:0 12px;font:14px Pretendard,sans-serif;width:240px}\
  .fb-mf label{display:flex;align-items:center;gap:6px;font-size:13px;cursor:pointer;white-space:nowrap}\
  .fb-mf label input{width:15px;height:15px;accent-color:#00459b;margin:0}\
  .fb-mh .x{border:0;background:none;font-size:26px;line-height:1;cursor:pointer;color:#666;margin-left:6px}\
  .fb-mb{flex:1;overflow:auto;padding:4px 22px 16px}\
  .fb-mb .empty{padding:60px 0;text-align:center;color:#999}\
  .fb-mp{margin-top:16px}\
  .fb-mph{display:flex;align-items:center;gap:10px;font-size:15px;font-weight:700;padding:10px 0;border-bottom:2px solid #1a1a1a;position:sticky;top:0;background:#fff;z-index:1}\
  .fb-mph span{font-size:12px;color:#777;font-weight:500}\
  .fb-mph em{font-style:normal;font-size:11px;color:#00459b;background:#eff4fa;border-radius:4px;padding:2px 6px}\
  .fb-mi{display:flex;gap:14px;padding:12px 6px;border-bottom:1px solid #f0f0f0;cursor:pointer;align-items:flex-start}\
  .fb-mi:hover{background:#fafbfd}\
  .fb-mi .n{flex:none;width:24px;height:24px;border-radius:12px;background:#e8562a;color:#fff;font:700 12px/24px Pretendard,sans-serif;text-align:center;margin-top:2px}\
  .fb-mi.theirs .n{background:#00459b}\
  .fb-mi .t{flex:1;min-width:0}\
  .fb-mi .w{font-size:13px;color:#777}\
  .fb-mi .a{font-size:12px;color:#00459b;font-weight:600;margin-top:2px}\
  .fb-mi .m{font-size:15px;line-height:1.55;white-space:pre-wrap;word-break:break-word;margin-top:4px}\
  .fb-mi .go{flex:none;font-size:13px;color:#00459b;align-self:center;white-space:nowrap}\
  .fb-mt{display:flex;align-items:center;gap:8px;padding:12px 22px;border-top:1px solid #eee;background:#fafafa;flex:none}\
  .fb-mt .hint{margin-left:auto;font-size:12px;color:#777}\
  .fb-panel .sync .me{margin-left:auto;color:#00459b;cursor:pointer;text-decoration:underline}\
  .fb-panel .list{max-height:300px;overflow:auto}\
  .fb-panel .empty{padding:24px 16px;color:#999;text-align:center;font-size:13px;line-height:1.7}\
  .fb-panel .it{display:flex;gap:10px;padding:10px 16px;border-top:1px solid #f0f0f0;cursor:pointer}\
  .fb-panel .it:hover{background:#fafafa}\
  .fb-panel .it .n{flex:none;width:22px;height:22px;border-radius:11px;background:#e8562a;color:#fff;font:700 12px/22px Pretendard,sans-serif;text-align:center}\
  .fb-panel .it.theirs .n{background:#00459b}\
  .fb-panel .it .t{flex:1;min-width:0}\
  .fb-panel .it .w{font-size:12px;color:#777;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}\
  .fb-panel .it .a{font-size:11px;color:#00459b;font-weight:600;margin-top:2px}\
  .fb-panel .it .m{margin-top:3px;white-space:pre-wrap;word-break:break-word;line-height:1.5}\
  .fb-panel .it .x{flex:none;align-self:flex-start;border:0;background:none;color:#bbb;font-size:16px;cursor:pointer;padding:0 2px}\
  .fb-panel .it .x:hover{color:#c8401a}\
  .fb-panel .other{padding:8px 16px;font-size:12px;color:#777;border-top:1px solid #f0f0f0;background:#fafafa}\
  .fb-panel .tools{display:flex;flex-wrap:wrap;gap:6px;padding:12px 16px;border-top:1px solid #eee}\
  .fb-toast{position:fixed;left:50%;bottom:30px;transform:translateX(-50%);z-index:100000;background:#1a1a1a;color:#fff;padding:10px 18px;border-radius:999px;font:14px Pretendard,sans-serif;box-shadow:0 6px 20px rgba(0,0,0,.3);opacity:0;transition:opacity .2s}\
  .fb-toast.on{opacity:1}\
  body.fb-off .fb-hover{outline:none !important;cursor:auto}\
  @media print{.fb-panel,.fb-badge,.fb-pop{display:none !important}}';
  var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);

  /* ---------- 뱃지 ---------- */
  var badgeLayer = document.createElement('div'); badgeLayer.id = 'fb-badges'; badgeLayer.style.cssText = 'position:absolute;left:0;top:0;width:0;height:0;pointer-events:none;z-index:99990';
  document.body.appendChild(badgeLayer);
  function isMine(n) { return !SYNC || !n.author || n.author === me(); }

  function renderBadges() {
    badgeLayer.innerHTML = '';
    Array.prototype.forEach.call(document.querySelectorAll('.fb-marked'), function (e) { e.classList.remove('fb-marked'); e.classList.remove('fb-theirs'); });
    notes().forEach(function (n, i) {
      var el = findByPath(n.path);
      if (!el) return;
      el.classList.add('fb-marked'); if (!isMine(n)) el.classList.add('fb-theirs');
      var r = el.getBoundingClientRect();
      var b = document.createElement('div');
      b.className = 'fb-badge' + (isMine(n) ? '' : ' theirs'); b.textContent = i + 1; b.title = (n.author ? n.author + ': ' : '') + n.note;
      b.style.left = (r.right + window.scrollX) + 'px';
      b.style.top = (r.top + window.scrollY) + 'px';
      b.onclick = function (ev) { ev.stopPropagation(); openPopup(el, { x: ev.clientX, y: ev.clientY }, n); };
      badgeLayer.appendChild(b);
    });
  }
  window.addEventListener('resize', renderBadges);
  window.addEventListener('load', function () { setTimeout(renderBadges, 300); });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { setTimeout(renderBadges, 50); });
  document.addEventListener('click', function () { setTimeout(renderBadges, 250); }, true);

  /* ---------- 마우스 오버 표시 ---------- */
  var hovered = null;
  function isOurs(el) { return !!(el && el.closest && el.closest('.fb-pop, .fb-panel, #fb-badges, .fb-toast')); }
  document.addEventListener('mousemove', function (e) {
    if (!settings.mode) return;
    var t = e.target;
    if (isOurs(t) || t === document.body || t === document.documentElement) t = null;
    if (t === hovered) return;
    if (hovered) hovered.classList.remove('fb-hover');
    hovered = t;
    if (hovered) hovered.classList.add('fb-hover');
  });

  /* ---------- 팝업 ---------- */
  var pop = null;
  function closePopup() { if (pop) { pop.remove(); pop = null; } }
  function openPopup(el, at, target) {
    closePopup();
    var path = pathOf(el);
    var existing = target || notes().filter(function (n) { return n.path === path && isMine(n); })[0] || null;
    var theirs = existing && !isMine(existing);
    var label = existing ? existing.label : labelOf(el);
    pop = document.createElement('div');
    pop.className = 'fb-pop';
    pop.innerHTML =
      '<div class="h">' + (existing ? (theirs ? '수정사항 (' + esc(existing.author) + ')' : '수정사항 편집') : '수정사항 남기기') + '<span>' + esc(TITLES[PAGE] || PAGE) + '</span></div>' +
      '<div class="b">' +
      '<div class="where">📍 ' + esc(label) + '</div>' +
      (existing && existing.author ? '<div class="who">' + esc(existing.author) + ' · ' + esc(fdate(existing.updated || existing.created)) + '</div>' : '') +
      '<textarea ' + (theirs ? 'readonly ' : '') + 'placeholder="예) 이 문구를 \'워크북 작성\'으로 바꿔주세요 / 이 버튼은 빼주세요 / 색을 더 진하게">' + esc(existing ? existing.note : '') + '</textarea>' +
      '<div class="f">' + (existing ? '<button class="fb-btn d mr" data-a="del">삭제</button>' : '') +
      (theirs ? '<button class="fb-btn mr" data-a="reply">내 메모 추가</button><button class="fb-btn" data-a="cancel">닫기</button>' :
        '<button class="fb-btn" data-a="cancel">취소</button><button class="fb-btn p" data-a="save">저장 (Ctrl+Enter)</button>') + '</div>' +
      '</div>';
    document.body.appendChild(pop);
    var W = 360, H = pop.offsetHeight || 260;
    var x = Math.min(at.x + 8, window.innerWidth - W - 12), y = Math.min(at.y + 8, window.innerHeight - H - 12);
    pop.style.left = Math.max(8, x) + 'px'; pop.style.top = Math.max(8, y) + 'px';
    var ta = pop.querySelector('textarea'); ta.focus();
    ta.addEventListener('keydown', function (e) { if (e.key === 'Enter' && e.ctrlKey && !theirs) doSave(); if (e.key === 'Escape') closePopup(); });
    pop.addEventListener('click', function (e) {
      var a = e.target.getAttribute && e.target.getAttribute('data-a');
      if (a === 'cancel') closePopup();
      else if (a === 'save') doSave();
      else if (a === 'reply') { closePopup(); openPopup(el, at, { fresh: true }); }
      else if (a === 'del') { if (confirm((theirs ? existing.author + '님의 ' : '') + '이 수정사항을 삭제할까요?')) { removeNote(existing.id); closePopup(); } }
    });
    if (existing && existing.fresh) { existing = null; theirs = false; }
    function doSave() {
      var text = ta.value.trim();
      if (!text) { ta.focus(); return; }
      var memo;
      if (existing) { existing.note = text; existing.updated = now(); memo = existing; }
      else { memo = { id: uid(), page: PAGE, path: path, label: label, note: text, created: now() }; if (SYNC) memo.author = author(); notes().push(memo); }
      closePopup(); refresh();
      if (SYNC) {
        var busy = setTimeout(function () { toast('저장 중…'); }, 400);
        syncPost({ action: 'save', memo: memo }).then(function () { clearTimeout(busy); toast('저장했습니다 (모두에게 보입니다)'); syncLoad(true); })
          .catch(function (e) { clearTimeout(busy); alert('공유 서버에 저장하지 못했습니다: ' + e.message + '\n잠시 후 다시 시도해 주세요.'); syncLoad(true); });
      } else { save(); toast('저장했습니다'); }
    }
  }
  function removeNote(id) {
    db[PAGE] = notes().filter(function (n) { return n.id !== id; }); refresh();
    if (SYNC) syncPost({ action: 'delete', id: id }).then(function () { syncLoad(true); }).catch(function (e) { alert('삭제하지 못했습니다: ' + e.message); syncLoad(true); });
    else save();
  }

  document.addEventListener('contextmenu', function (e) {
    if (!settings.mode || e.shiftKey || isOurs(e.target)) return;
    e.preventDefault();
    openPopup(e.target, { x: e.clientX, y: e.clientY });
  });
  document.addEventListener('mousedown', function (e) { if (pop && !pop.contains(e.target)) closePopup(); });

  /* ---------- 패널 ---------- */
  var panel = document.createElement('div');
  panel.className = 'fb-panel' + (settings.open ? ' open' : '');
  document.body.appendChild(panel);

  function total() { var c = 0; for (var k in db) c += (db[k] || []).length; return c; }
  function refresh() {
    var list = notes();
    var others = total() - list.length;
    panel.innerHTML =
      '<div class="ph"><b>✎ 수정사항</b><span class="cnt">' + list.length + '</span><span class="tg">' + (panel.classList.contains('open') ? '접기 ▾' : '펼치기 ▴') + '</span></div>' +
      '<div class="pb">' +
      '<div class="mode"><label><input type="checkbox" ' + (settings.mode ? 'checked' : '') + '> 우클릭으로 메모 남기기</label><span class="hint">Shift+우클릭 = 기본 메뉴</span></div>' +
      (SYNC ? '<div class="sync"><span class="dot' + (syncState.loading ? ' busy' : (syncState.ok ? '' : ' off')) + '"></span>' + (syncState.loading ? '공유 서버와 동기화 중… (저장된 목록을 먼저 보여줍니다)' : (syncState.ok ? '공유 모드 · 마지막 동기화 ' + syncState.at : '공유 서버 연결 안 됨 · 저장된 목록 표시')) + '<span class="me" data-t="who">' + esc(me() || '이름 설정') + '</span></div>' : '') +
      '<div class="list">' + (list.length ? list.map(function (n, i) {
        var mine = isMine(n);
        return '<div class="it' + (mine ? '' : ' theirs') + '" data-id="' + n.id + '"><span class="n">' + (i + 1) + '</span><div class="t"><div class="w">' + esc(n.label) + '</div>' + (n.author ? '<div class="a">' + esc(n.author) + ' · ' + esc(fdate(n.updated || n.created)) + '</div>' : '') + '<div class="m">' + esc(n.note) + '</div></div><button class="x" data-del="' + n.id + '" title="삭제">×</button></div>';
      }).join('') : '<div class="empty">아직 남긴 수정사항이 없습니다.<br>바꾸고 싶은 글자·버튼·영역을 <b>우클릭</b>해 보세요.</div>') + '</div>' +
      (others ? '<div class="other" data-t="all">다른 페이지의 수정사항 ' + others + '건 — 전체 보기 ›</div>' : '') +
      '<div class="tools">' +
      '<button class="fb-btn p" data-t="all">🗂 전체 보기 (' + total() + ')</button>' +
      '<button class="fb-btn" data-t="copy">📋 전체 복사</button>' +
      '<button class="fb-btn" data-t="txt">⬇ 텍스트 저장</button>' +
      (SYNC ? '<button class="fb-btn" data-t="reload">↻ 새로고침</button>' :
        '<button class="fb-btn" data-t="json">⬇ 백업(JSON)</button><button class="fb-btn" data-t="import">⬆ 불러오기</button><button class="fb-btn d" data-t="clear">이 페이지 비우기</button>') +
      '</div></div>';
    renderBadges();
  }
  panel.addEventListener('click', function (e) {
    var t = e.target;
    if (t.closest('.ph')) { panel.classList.toggle('open'); localStorage.setItem(KEY + ':open', panel.classList.contains('open') ? 'open' : 'closed'); refresh(); return; }
    if (t.matches('.mode input')) { settings.mode = t.checked; localStorage.setItem(KEY + ':mode', settings.mode ? 'on' : 'off'); document.body.classList.toggle('fb-off', !settings.mode); if (hovered) hovered.classList.remove('fb-hover'); return; }
    var del = t.getAttribute('data-del');
    if (del) { if (confirm('삭제할까요?')) removeNote(del); return; }
    var it = t.closest('.it');
    if (it) {
      var n = notes().filter(function (x) { return x.id === it.getAttribute('data-id'); })[0];
      var el = n && findByPath(n.path);
      if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); setTimeout(function () { var r = el.getBoundingClientRect(); openPopup(el, { x: r.left, y: r.bottom }, n); }, 400); }
      return;
    }
    var tool = t.getAttribute('data-t');
    if (tool === 'all') openModal();
    else if (tool === 'copy') copyText(exportText());
    else if (tool === 'txt') download('수정사항_' + now().replace(/[: ]/g, '-') + '.txt', exportText(), 'text/plain');
    else if (tool === 'json') download('수정사항_백업_' + now().replace(/[: ]/g, '-') + '.json', JSON.stringify(db, null, 2), 'application/json');
    else if (tool === 'import') importJson();
    else if (tool === 'reload') syncLoad(false).then(function () { toast('최신 메모를 불러왔습니다'); });
    else if (tool === 'who') { author(true); refresh(); }
    else if (tool === 'clear') { if (notes().length && confirm('이 페이지의 수정사항 ' + notes().length + '건을 모두 삭제할까요?')) { db[PAGE] = []; save(); refresh(); } }
  });

  /* ---------- 전체 보기 팝업 ---------- */
  var modal = null, mq = '', mMine = false;
  function focusNote(n) {
    var el = findByPath(n.path); if (!el) { toast('이 화면에서 해당 위치를 찾지 못했습니다'); return; }
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setTimeout(function () { var r = el.getBoundingClientRect(); openPopup(el, { x: r.left, y: r.bottom }, n); }, 450);
  }
  function closeModal() { if (modal) { modal.remove(); modal = null; } }
  function renderModal() {
    if (!modal) return;
    var q = mq.toLowerCase(), pages = PAGE_ORDER.concat(Object.keys(db).filter(function (k) { return PAGE_ORDER.indexOf(k) < 0; })), html = '', shown = 0;
    pages.forEach(function (p) {
      var all = db[p] || [];
      var list = all.filter(function (n) { return (!mMine || isMine(n)) && (!q || ((n.note || '') + ' ' + (n.label || '') + ' ' + (n.author || '')).toLowerCase().indexOf(q) >= 0); });
      if (!list.length) return;
      html += '<div class="fb-mp"><div class="fb-mph">' + esc(TITLES[p] || p) + '<span>' + list.length + '건</span>' + (p === PAGE ? '<em>현재 화면</em>' : '') + '</div>';
      list.forEach(function (n) {
        shown++;
        html += '<div class="fb-mi' + (isMine(n) ? '' : ' theirs') + '" data-page="' + esc(p) + '" data-id="' + esc(n.id) + '"><span class="n">' + (all.indexOf(n) + 1) + '</span><div class="t"><div class="w">' + esc(n.label) + '</div>' + (n.author ? '<div class="a">' + esc(n.author) + ' · ' + esc(fdate(n.updated || n.created)) + '</div>' : '') + '<div class="m">' + esc(n.note) + '</div></div><span class="go">' + (p === PAGE ? '위치 보기 ›' : '화면으로 이동 ›') + '</span></div>';
      });
      html += '</div>';
    });
    modal.querySelector('.fb-mb').innerHTML = html || '<div class="empty">표시할 수정사항이 없습니다.</div>';
    modal.querySelector('.cnt').textContent = total() + '건';
  }
  function openModal() {
    closeModal(); closePopup();
    modal = document.createElement('div'); modal.className = 'fb-modal';
    modal.innerHTML = '<div class="fb-mbox"><div class="fb-mh"><b>✎ 수정사항 전체</b><span class="cnt"></span><div class="fb-mf"><input type="search" placeholder="검색 (내용 · 위치 · 작성자)" value="' + esc(mq) + '"><label><input type="checkbox" data-mine' + (mMine ? ' checked' : '') + '> 내 메모만</label></div><button class="x" data-a="close" title="닫기 (ESC)">×</button></div><div class="fb-mb"></div><div class="fb-mt"><button class="fb-btn p" data-t="copy">📋 전체 복사</button><button class="fb-btn" data-t="txt">⬇ 텍스트 저장</button>' + (SYNC ? '<button class="fb-btn" data-t="reload">↻ 새로고침</button>' : '') + '<span class="hint">항목을 누르면 해당 화면의 그 자리로 이동합니다.</span></div></div>';
    document.body.appendChild(modal); renderModal();
    modal.querySelector('input[type=search]').addEventListener('input', function (e) { mq = e.target.value; renderModal(); });
    modal.querySelector('[data-mine]').addEventListener('change', function (e) { mMine = e.target.checked; renderModal(); });
    modal.addEventListener('mousedown', function (e) { if (e.target === modal) closeModal(); });
    modal.addEventListener('click', function (e) {
      var t = e.target;
      if (t.getAttribute('data-a') === 'close') { closeModal(); return; }
      var tool = t.getAttribute('data-t');
      if (tool === 'copy') { copyText(exportText()); return; }
      if (tool === 'txt') { download('수정사항_' + now().replace(/[: ]/g, '-') + '.txt', exportText(), 'text/plain'); return; }
      if (tool === 'reload') { syncLoad(false).then(function () { toast('최신 메모를 불러왔습니다'); }); return; }
      var it = t.closest('.fb-mi'); if (!it) return;
      var p = it.getAttribute('data-page'), id = it.getAttribute('data-id');
      if (p === PAGE) { closeModal(); var n = notes().filter(function (x) { return x.id === id; })[0]; if (n) focusNote(n); }
      else location.href = p + '#fb=' + encodeURIComponent(id);
    });
    if (SYNC) syncLoad(true);
  }
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && modal) closeModal(); });

  /* ---------- 내보내기 ---------- */
  function exportText() {
    var lines = ['■ PUNDIT 홈페이지 수정사항 (' + now() + ')', '총 ' + total() + '건', ''];
    var pages = PAGE_ORDER.concat(Object.keys(db).filter(function (k) { return PAGE_ORDER.indexOf(k) < 0; }));
    pages.forEach(function (p) {
      var list = db[p] || [];
      if (!list.length) return;
      lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      lines.push('[' + p + '] ' + (TITLES[p] || '') + ' — ' + list.length + '건');
      lines.push('');
      list.forEach(function (n, i) {
        lines.push((i + 1) + '. 위치: ' + n.label + (n.author ? '   (작성: ' + n.author + ' · ' + fdate(n.updated || n.created) + ')' : ''));
        lines.push('   요청: ' + n.note.replace(/\n/g, '\n         '));
        lines.push('   (선택자: ' + n.path + ')');
        lines.push('');
      });
    });
    return lines.join('\n');
  }
  function copyText(text) {
    function ok() { toast('복사했습니다. 채팅창에 붙여넣기(Ctrl+V) 하세요.'); }
    function fallback() {
      var ta = document.createElement('textarea'); ta.value = text; ta.style.cssText = 'position:fixed;left:-9999px'; document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); ok(); } catch (e) { alert('복사에 실패했습니다. "텍스트 저장"을 이용해 주세요.'); }
      ta.remove();
    }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(ok, fallback); else fallback();
  }
  function download(name, content, type) {
    var blob = new Blob(['﻿' + content], { type: type + ';charset=utf-8' });
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  function importJson() {
    var inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.json,application/json';
    inp.onchange = function () {
      var f = inp.files[0]; if (!f) return;
      var r = new FileReader();
      r.onload = function () {
        try {
          var data = JSON.parse(r.result); var added = 0;
          Object.keys(data).forEach(function (p) {
            db[p] = db[p] || [];
            (data[p] || []).forEach(function (n) { if (!db[p].some(function (x) { return x.id === n.id; })) { db[p].push(n); added++; } });
          });
          save(); refresh(); toast(added + '건을 불러왔습니다');
        } catch (e) { alert('파일을 읽을 수 없습니다: ' + e.message); }
      };
      r.readAsText(f);
    };
    inp.click();
  }

  /* ---------- 토스트 ---------- */
  var toastEl = document.createElement('div'); toastEl.className = 'fb-toast'; document.body.appendChild(toastEl); var toastTimer;
  function toast(msg) { toastEl.textContent = msg; toastEl.classList.add('on'); clearTimeout(toastTimer); toastTimer = setTimeout(function () { toastEl.classList.remove('on'); }, 2200); }

  document.body.classList.toggle('fb-off', !settings.mode);
  refresh();
  function tryFocus() {
    if (!pendingFocus) return;
    var n = notes().filter(function (x) { return x.id === pendingFocus; })[0];
    if (n) { pendingFocus = ''; setTimeout(function () { focusNote(n); }, 400); }
  }
  window.addEventListener('load', function () { setTimeout(tryFocus, 350); });
  if (SYNC) { var _refresh = refresh; refresh = function () { _refresh(); tryFocus(); }; }
})();
