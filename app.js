/* Kompass DaF B2 – Karteikarten, Grammatik & Fehlertraining. No build step, no dependencies. */
(() => {
  "use strict";

  const LESSONS = (window.LESSONS || []).slice().sort((a, b) => a.id - b.id);
  const $ = (s, el = document) => el.querySelector(s);
  const app = $("#app");

  // ---------- storage (safe) ----------
  const KEY = "kompass-b2-flashcards-v1";
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } };
  const saved = load();
  const store = {
    known: saved.known || {},        // cardId -> true
    starred: saved.starred || {},    // cardId -> true
    mistakes: saved.mistakes || {},  // lessonId -> { w: {cardId: n}, g: {questionId: n} }
    dir: saved.dir || "de",
    lesson: saved.lesson || (LESSONS[0] && LESSONS[0].id),
    theme: saved.theme || null,
  };
  const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(store)); } catch { /* private mode etc. */ } };

  // ---------- state ----------
  const state = {
    mode: "cards",
    sections: new Set(), starOnly: false, unknownOnly: false,
    review: false,                  // true while practising the mistakes list
    deck: [], i: 0, flipped: false,
    round: { good: 0, bad: 0, missed: [] },
    learn: null, write: null,
    gview: "explain", gtopic: "", gquiz: null,
  };

  const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const lesson = () => LESSONS.find(l => l.id === store.lesson) || LESSONS[0];

  // ---------- mistakes ----------
  function mbox() {
    const k = String(lesson().id);
    if (!store.mistakes[k]) store.mistakes[k] = { w: {}, g: {} };
    return store.mistakes[k];
  }
  function addMistake(kind, id) { const m = mbox()[kind]; m[id] = (m[id] || 0) + 1; persist(); }
  function clearMistake(kind, id) { delete mbox()[kind][id]; persist(); }
  function undoMistake(kind, id) { const m = mbox()[kind]; if (m[id] > 1) m[id]--; else delete m[id]; persist(); }
  const mistakeCards = () => { const m = mbox().w; return lesson().cards.filter(c => m[c.id]); };
  const mistakeQs = () => { const m = mbox().g; return (lesson().quiz || []).filter(q => m[q.id]); };
  function wordWrong(c) { delete store.known[c.id]; addMistake("w", c.id); }
  function wordRight(c, firstTry = true) {
    if (firstTry) store.known[c.id] = true;
    if (state.review) clearMistake("w", c.id); else persist();
  }

  function pool() {
    const L = lesson(); if (!L) return [];
    return L.cards.filter(c =>
      (!state.sections.size || state.sections.has(c.s)) &&
      (!state.starOnly || store.starred[c.id]) &&
      (!state.unknownOnly || !store.known[c.id]));
  }

  // ---------- speech ----------
  const hasTTS = "speechSynthesis" in window;
  let deVoice = null;
  function pickVoice() {
    if (!hasTTS) return;
    const v = speechSynthesis.getVoices();
    deVoice = v.find(x => /^de(-|_)DE/i.test(x.lang)) || v.find(x => /^de/i.test(x.lang)) || null;
  }
  if (hasTTS) { pickVoice(); speechSynthesis.onvoiceschanged = pickVoice; }
  function speak(text) {
    if (!hasTTS) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "de-DE"; if (deVoice) u.voice = deVoice; u.rate = 0.92;
    speechSynthesis.speak(u);
  }
  function cleanWord(w) {
    return w.replace(/\([^)]*\)/g, "").split(/\s*[\/≠]\s*/)[0]
      .replace(/,.*$/, "").replace(/\s*\+\s*[ADG]\b.*$/, "").replace(/\s+/g, " ").trim();
  }

  // ---------- header / filters ----------
  function initChrome() {
    const sel = $("#lesson");
    sel.innerHTML = LESSONS.map(l => `<option value="${l.id}">${esc(l.title)} (${l.cards.length})</option>`).join("");
    sel.value = store.lesson;
    sel.onchange = () => { store.lesson = +sel.value; persist(); state.sections.clear(); renderChips(); setMode(state.mode); };

    $("#themeBtn").onclick = () => {
      const cur = document.documentElement.dataset.theme ||
        (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
      store.theme = cur === "dark" ? "light" : "dark"; applyTheme(); persist();
    };
    applyTheme();

    document.querySelectorAll(".modes button").forEach(b => b.onclick = () => setMode(b.dataset.mode));

    const dir = $("#dirToggle");
    dir.checked = store.dir === "fa";
    dir.onchange = () => { store.dir = dir.checked ? "fa" : "de"; persist(); updateDirLabel(); restart(); };
    updateDirLabel();
    $("#starOnly").onchange = e => { state.starOnly = e.target.checked; restart(); };
    $("#unknownOnly").onchange = e => { state.unknownOnly = e.target.checked; restart(); };
    renderChips();
  }
  function applyTheme() { if (store.theme) document.documentElement.dataset.theme = store.theme; }
  function updateDirLabel() { $("#dirLabel").textContent = store.dir === "fa" ? "Persisch" : "Deutsch"; }
  function renderChips() {
    const L = lesson(); const box = $("#sections");
    const chips = [`<button class="chip ${state.sections.size ? "" : "on"}" data-s="">Alle</button>`]
      .concat(L.sections.map(s => `<button class="chip ${state.sections.has(s.id) ? "on" : ""}" data-s="${s.id}" title="${esc(s.title)}">${s.id} · ${esc(s.title)}</button>`));
    box.innerHTML = chips.join("");
    box.querySelectorAll(".chip").forEach(c => c.onclick = () => {
      const s = c.dataset.s;
      if (!s) state.sections.clear();
      else state.sections.has(s) ? state.sections.delete(s) : state.sections.add(s);
      renderChips(); restart();
    });
  }
  function setMode(m, opts = {}) {
    state.mode = m;
    document.querySelectorAll(".modes button").forEach(b => b.classList.toggle("active", b.dataset.mode === m));
    $(".filters").hidden = (m === "grammar" || m === "mistakes" || !!opts.deck);
    if (m === "grammar" && !opts.keepGrammar) { state.gview = "explain"; state.gquiz = null; }
    restart(opts);
    window.scrollTo({ top: 0 });
  }
  function updateStats() {
    const L = lesson(); const total = L.cards.length;
    const known = L.cards.filter(c => store.known[c.id]).length;
    const stars = L.cards.filter(c => store.starred[c.id]).length;
    const mw = Object.keys(mbox().w).length, mg = Object.keys(mbox().g).length;
    $("#stats").textContent = `${L.title}: ${known} / ${total} gelernt · ${stars} markiert · ${mw + mg} Fehler offen`;
    const badge = $("#mbadge");
    if (badge) { badge.textContent = mw + mg; badge.hidden = !(mw + mg); }
  }

  let shuffleOn = false;
  function restart(opts = {}) {
    state.review = !!opts.deck;
    state.deck = opts.deck ? shuffle(opts.deck) : (shuffleOn ? shuffle(pool()) : pool());
    state.i = 0; state.flipped = false; state.round = { good: 0, bad: 0, missed: [] };
    state.learn = null; state.write = null;
    if (state.mode !== "grammar") state.gquiz = null;
    render();
  }

  function render() {
    updateStats();
    switch (state.mode) {
      case "cards": return renderCards();
      case "learn": return renderLearn();
      case "write": return renderWrite();
      case "grammar": return renderGrammar();
      case "mistakes": return renderMistakes();
      default: return renderList();
    }
  }

  const emptyMsg = () => `<div class="panel empty">Keine Karten für diese Auswahl.<br><span class="fa">کارتی با این فیلتر وجود ندارد.</span></div>`;
  const progressBar = (n, total, extra = "") =>
    `<div class="progress"><span>${Math.min(n, total)} / ${total}</span><div class="bar"><i style="width:${total ? (100 * n / total) : 0}%"></i></div>${extra}</div>`;
  const reviewBanner = () => state.review
    ? `<div class="banner"><b>Fehler-Training</b> · <span class="fa">مرور اشتباه‌ها — هر کلمه‌ای را درست جواب بدهی از فهرست حذف می‌شود.</span>
        <button class="link" data-goto="mistakes">Zurück zur Fehlerliste</button></div>` : "";

  function backDetails(c) {
    return `
      <div class="row"><div class="lab">Synonym(e)</div><div class="syn">${esc(c.syn)}</div></div>
      <div class="row"><div class="lab">Beispiel <button class="say" data-say="${esc(c.de)}" title="Vorlesen" aria-label="Vorlesen">🔊</button></div>
        <div class="ex">${esc(c.de)}</div><div class="exfa fa">${esc(c.fas)}</div></div>`;
  }

  // ---------- flashcards ----------
  function renderCards() {
    const d = state.deck;
    if (!d.length) { app.innerHTML = emptyMsg(); return; }
    if (state.i >= d.length) return renderCardsDone();
    const c = d[state.i]; const faFront = store.dir === "fa";
    const star = store.starred[c.id] ? "on" : "";
    const front = faFront ? `<div class="big fa">${esc(c.fa)}</div>` : `<div class="big">${esc(c.w)}</div>`;
    const sec = lesson().sections.find(s => s.id === c.s);
    app.innerHTML = `
      ${reviewBanner()}
      ${progressBar(state.i, d.length, `<span class="tally"><span class="b">✗ ${state.round.bad}</span><span class="g">✓ ${state.round.good}</span></span>`)}
      <div class="stage">
        <div class="card ${state.flipped ? "flipped" : ""}" id="card" tabindex="0" role="button" aria-label="Karte umdrehen">
          <div class="face front">
            <span class="corner">${c.s} · ${esc(sec ? sec.title : "")}</span>
            <div class="tools">
              ${!faFront && hasTTS ? `<button class="tool" data-say="${esc(cleanWord(c.w))}" title="Vorlesen (A)">🔊</button>` : ""}
              <button class="tool star ${star}" data-star="${c.id}" title="Markieren (S)">★</button>
            </div>
            ${front}
            <span class="hint">Klicken oder Leertaste zum Umdrehen</span>
          </div>
          <div class="face back">
            <div class="tools">
              ${hasTTS ? `<button class="tool" data-say="${esc(cleanWord(c.w))}" title="Vorlesen (A)">🔊</button>` : ""}
              <button class="tool star ${star}" data-star="${c.id}" title="Markieren (S)">★</button>
            </div>
            <div class="head"><span class="hw">${esc(c.w)}</span><span class="mean fa">${esc(c.fa)}</span></div>
            ${backDetails(c)}
          </div>
        </div>
      </div>
      <div class="ctrl">
        <button class="nav" id="prev" title="Zurück (←)" aria-label="Zurück">←</button>
        <div class="judge">
          <button class="btn bad" id="bad">✗ Noch nicht<span class="fa">هنوز نه</span></button>
          <button class="btn good" id="good">✓ Gewusst<span class="fa">بلد بودم</span></button>
        </div>
        <button class="nav" id="next" title="Weiter (→)" aria-label="Weiter">→</button>
      </div>
      <div class="subctrl">
        ${state.review ? "" : `<button class="link" id="shuf">${shuffleOn ? "Reihenfolge: gemischt ✓" : "Karten mischen"}</button>`}
        <button class="link" id="reset">Neu starten</button>
      </div>`;
    const card = $("#card");
    card.onclick = e => { if (e.target.closest(".tool,.say")) return; flip(); };
    bindCommon(app);
    $("#prev").onclick = () => go(-1);
    $("#next").onclick = () => go(1);
    $("#bad").onclick = () => judge(false);
    $("#good").onclick = () => judge(true);
    const sh = $("#shuf"); if (sh) sh.onclick = () => { shuffleOn = !shuffleOn; restart(); };
    $("#reset").onclick = () => restart(state.review ? { deck: mistakeCards() } : {});
    addSwipe(card);
  }
  function flip() { state.flipped = !state.flipped; const c = $("#card"); if (c) c.classList.toggle("flipped", state.flipped); }
  function go(step) {
    const n = state.i + step;
    if (n < 0) return;
    state.i = Math.min(n, state.deck.length); state.flipped = false; render();
  }
  function judge(ok) {
    const c = state.deck[state.i]; if (!c) return;
    if (ok) { wordRight(c); state.round.good++; }
    else { wordWrong(c); state.round.bad++; state.round.missed.push(c); }
    const el = $("#card");
    if (el) el.classList.add(ok ? "swipe-right" : "swipe-left");
    setTimeout(() => { state.i++; state.flipped = false; render(); }, 160);
  }
  function renderCardsDone() {
    const r = state.round, total = r.good + r.bad;
    app.innerHTML = `
      <div class="panel done">
        <div class="lab">Runde beendet · <span class="fa">پایان دور</span></div>
        <div class="score">${r.good} / ${total || state.deck.length}</div>
        <div>gewusst${r.bad ? ` · <b>${r.bad}</b> noch zu lernen` : " – alles gewusst! 🎉"}</div>
        ${r.missed.length ? missedList(r.missed) : ""}
        <div class="actions">
          ${r.missed.length ? `<button class="btn primary" id="again">✗-Karten wiederholen (${r.missed.length})</button>` : ""}
          <button class="btn" id="restart">Alle Karten neu</button>
          <button class="btn" data-goto="mistakes">Zur Fehlerliste</button>
        </div>
      </div>`;
    const again = $("#again");
    if (again) again.onclick = () => { state.deck = shuffle(r.missed); state.i = 0; state.flipped = false; state.round = { good: 0, bad: 0, missed: [] }; render(); };
    $("#restart").onclick = () => restart(state.review ? { deck: mistakeCards() } : {});
    bindCommon(app);
  }
  function missedList(cards) {
    return `<div class="missed"><div class="lab">Diese Wörter hast du nicht gewusst · <span class="fa">این کلمه‌ها را بلد نبودی</span></div>
      ${cards.map(c => `<div class="mrow"><b>${esc(c.w)}</b><span class="fa">${esc(c.fa)}</span></div>`).join("")}</div>`;
  }
  function addSwipe(el) {
    let x0 = null, y0 = null;
    el.addEventListener("touchstart", e => { x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; }, { passive: true });
    el.addEventListener("touchend", e => {
      if (x0 === null) return;
      const dx = e.changedTouches[0].clientX - x0, dy = e.changedTouches[0].clientY - y0;
      x0 = null;
      if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) { e.preventDefault(); judge(dx > 0); }
    });
  }

  // ---------- learn (multiple choice) ----------
  function renderLearn() {
    const d = state.deck;
    if (!d.length) { app.innerHTML = emptyMsg(); return; }
    if (!state.learn) state.learn = { queue: shuffle(d), total: d.length, n: 0, right: 0, wrongSet: new Set(), wrongCards: [], answered: false };
    const L = state.learn;
    if (!L.queue.length) return renderScore(L.right, L.total, L.wrongCards);
    const c = L.queue[0];
    const faFront = store.dir === "fa";
    if (!L.opts || L.opts.card !== c) {
      const key = x => faFront ? x.w : x.fa;
      const others = shuffle(lesson().cards.filter(x => x.id !== c.id && key(x) !== key(c))).slice(0, 3);
      L.opts = { card: c, list: shuffle([c, ...others]) };
    }
    const prompt = faFront ? `<div class="big fa">${esc(c.fa)}</div>` : `<div class="big">${esc(c.w)}</div>`;
    const optHtml = L.opts.list.map((o, k) =>
      `<button class="choice ${faFront ? "" : "fa"}" data-id="${o.id}"><span class="k">${k + 1}</span>${esc(faFront ? o.w : o.fa)}</button>`).join("");
    app.innerHTML = `
      ${reviewBanner()}
      ${progressBar(L.n, L.total, `<span class="tally"><span class="g">✓ ${L.right}</span></span>`)}
      <div class="panel">
        <div class="q"><div class="lab">${faFront ? "Welches deutsche Wort passt? · <span class='fa'>کدام کلمه‌ی آلمانی؟</span>" : "Was bedeutet das? · <span class='fa'>معنی‌اش چیست؟</span>"}</div>
          ${prompt}
          ${!faFront && hasTTS ? `<button class="say" data-say="${esc(cleanWord(c.w))}">🔊</button>` : ""}
        </div>
        <div class="choices">${optHtml}</div>
        <div class="feedback" id="fb"></div>
      </div>`;
    bindCommon(app);
    app.querySelectorAll(".choice").forEach(b => b.onclick = () => answerLearn(b.dataset.id));
  }
  function answerLearn(id) {
    const L = state.learn; if (L.answered) return;
    L.answered = true;
    const c = L.queue[0]; const ok = id === c.id;
    app.querySelectorAll(".choice").forEach(b => {
      b.disabled = true;
      if (b.dataset.id === c.id) b.classList.add("right");
      else if (b.dataset.id === id) b.classList.add("wrong");
    });
    const fb = $("#fb");
    if (ok) {
      const first = !L.wrongSet.has(c.id);
      if (first) { L.right++; L.n++; }
      wordRight(c, first);
      fb.innerHTML = `<span class="ok">Richtig! · <span class="fa">درست است!</span></span>`;
      setTimeout(() => nextLearn(false), 750);
    } else {
      if (!L.wrongSet.has(c.id)) { L.wrongSet.add(c.id); L.wrongCards.push(c); L.n++; }
      wordWrong(c);
      fb.innerHTML = `<span class="no">Leider falsch. · <span class="fa">اشتباه بود.</span></span><div class="reveal" style="text-align:left">
        <b>${esc(c.w)}</b> — <span class="fa">${esc(c.fa)}</span>${backDetails(c)}</div>
        <div style="margin-top:12px"><button class="btn primary" id="cont">Weiter (Enter)</button></div>`;
      bindCommon(fb);
      $("#cont").onclick = () => nextLearn(true);
      $("#cont").focus();
    }
  }
  function nextLearn(requeue) {
    const L = state.learn; if (!L) return;
    const c = L.queue.shift();
    // a wrong answer comes back a few cards later, until it is answered correctly (like Quizlet "Learn")
    if (requeue) L.queue.splice(Math.min(L.queue.length, 3 + Math.floor(Math.random() * 3)), 0, c);
    L.answered = false; L.opts = null; render();
  }

  // ---------- write ----------
  const norm = s => s.toLowerCase()
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
    .replace(/^(der|die|das|sich)\s+/, "").replace(/[^a-z\s-]/g, "").replace(/\s+/g, " ").trim();
  function accepted(c) {
    const parts = c.w.replace(/\([^)]*\)/g, "").split(/\s*[\/≠]\s*/);
    const out = new Set();
    parts.forEach(p => {
      const t = p.replace(/,.*$/, "").replace(/\s*\+\s*[ADG]\b.*$/, "").trim();
      if (t) { out.add(norm(t)); out.add(norm(t.replace(/^sich\s+/, ""))); }
    });
    return [...out].filter(Boolean);
  }
  function lev(a, b) {
    const m = a.length, n = b.length; if (!m) return n; if (!n) return m;
    let prev = Array.from({ length: n + 1 }, (_, j) => j);
    for (let i = 1; i <= m; i++) {
      const cur = [i];
      for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = cur;
    }
    return prev[n];
  }
  function renderWrite() {
    const d = state.deck;
    if (!d.length) { app.innerHTML = emptyMsg(); return; }
    if (!state.write) state.write = { queue: shuffle(d), n: 0, right: 0, done: false, wrongCards: [] };
    const W = state.write;
    if (!W.queue.length) return renderScore(W.right, W.n, W.wrongCards);
    const c = W.queue[0];
    app.innerHTML = `
      ${reviewBanner()}
      ${progressBar(W.n, W.n + W.queue.length, `<span class="tally"><span class="g">✓ ${W.right}</span></span>`)}
      <div class="panel">
        <div class="q"><div class="lab">Schreib das deutsche Wort · <span class="fa">کلمه‌ی آلمانی را بنویس</span></div>
          <div class="big fa">${esc(c.fa)}</div>
          <div class="syn" style="margin-top:6px">≈ ${esc(c.syn)}</div>
        </div>
        <form class="answer-box" id="wf" autocomplete="off">
          <input id="ans" lang="de" spellcheck="false" autocapitalize="off" placeholder="z. B. der Stoff" aria-label="Antwort">
          <button class="btn primary" type="submit">Prüfen</button>
        </form>
        <div class="subctrl"><button class="link" id="dunno">Weiß ich nicht · <span class="fa">نمی‌دانم</span></button></div>
        <div class="feedback" id="fb"></div>
      </div>`;
    bindCommon(app);
    const inp = $("#ans"); inp.focus();
    $("#wf").onsubmit = e => { e.preventDefault(); W.done ? nextWrite() : checkWrite(inp.value); };
    $("#dunno").onclick = () => checkWrite("");
  }
  function checkWrite(val) {
    const W = state.write; if (W.done) return;
    W.done = true;
    const c = W.queue[0]; const inp = $("#ans");
    const v = norm(val); const acc = accepted(c);
    const ok = !!v && acc.includes(v);
    const close = !ok && v && acc.some(a => lev(a, v) <= (a.length > 6 ? 2 : 1));
    inp.classList.add(ok ? "right" : "wrong"); inp.readOnly = true;
    const fb = $("#fb");
    const reveal = `<div class="reveal" style="text-align:left"><b>${esc(c.w)}</b> — <span class="fa">${esc(c.fa)}</span>${backDetails(c)}</div>`;
    if (ok) {
      W.right++; wordRight(c);
      fb.innerHTML = `<span class="ok">Richtig! · <span class="fa">درست است!</span></span>${reveal}<div style="margin-top:12px"><button class="btn primary" id="cont">Weiter (Enter)</button></div>`;
    } else {
      wordWrong(c); W.wrongCards.push(c);
      fb.innerHTML = `<span class="no">${close ? "Fast! Kleiner Tippfehler." : val ? "Leider falsch." : "Die Lösung:"}</span>${reveal}
        <div style="margin-top:12px;display:flex;gap:8px;justify-content:center;flex-wrap:wrap">
          ${val ? `<button class="btn" id="override">Ich hatte recht</button>` : ""}
          <button class="btn primary" id="cont">Weiter (Enter)</button></div>`;
      const o = $("#override");
      if (o) o.onclick = () => { undoMistake("w", c.id); W.wrongCards.pop(); W.right++; wordRight(c); nextWrite(); };
    }
    bindCommon(fb);
    $("#cont").onclick = nextWrite;
    $("#cont").focus();
  }
  function nextWrite() { const W = state.write; W.queue.shift(); W.n++; W.done = false; render(); }

  function renderScore(right, n, wrongCards = []) {
    const pct = n ? Math.round(100 * right / n) : 0;
    app.innerHTML = `
      <div class="panel done">
        <div class="lab">Ergebnis · <span class="fa">نتیجه</span></div>
        <div class="score">${pct}%</div>
        <div>${right} von ${n} beim ersten Versuch richtig</div>
        ${wrongCards.length ? missedList(wrongCards) : ""}
        <div class="actions">
          ${wrongCards.length && !state.review ? `<button class="btn primary" id="wrongAgain">Falsche noch einmal (${wrongCards.length})</button>` : ""}
          <button class="btn" id="again">Noch einmal</button>
          <button class="btn" data-goto="mistakes">Zur Fehlerliste</button>
        </div>
      </div>`;
    const wa = $("#wrongAgain"); if (wa) wa.onclick = () => setMode(state.mode, { deck: wrongCards });
    $("#again").onclick = () => restart(state.review ? { deck: mistakeCards() } : {});
    bindCommon(app);
  }

  // ---------- grammar ----------
  function renderGrammar() {
    const L = lesson();
    const topics = L.grammar || [];
    if (!topics.length) { app.innerHTML = `<div class="panel empty">Für diese Lektion gibt es noch keine Grammatik.</div>`; return; }
    const tabs = `<div class="gtabs">
      <button class="chip ${state.gview === "explain" ? "on" : ""}" data-gv="explain">Erklärung · <span class="fa">توضیح</span></button>
      <button class="chip ${state.gview === "quiz" ? "on" : ""}" data-gv="quiz">Übungen · <span class="fa">تمرین</span> (${(L.quiz || []).length})</button>
    </div>`;
    if (state.gview === "explain") {
      app.innerHTML = tabs + topics.map((t, k) => `
        <article class="panel gtopic">
          <div class="gtitle"><h2>${k + 1}. ${esc(t.title)}</h2><span class="fa">${esc(t.title_fa)}</span></div>
          <p class="goal">${esc(t.goal_de)}</p><p class="goal fa">${esc(t.goal_fa)}</p>
          ${t.rules.map(r => `
            <section class="rule">
              <h3>${esc(r.head)}</h3>
              <p>${esc(r.de)}</p>
              <p class="fa rfa">${esc(r.fa)}</p>
              ${r.ex.map(([de, fa]) => `<div class="gex"><div class="ex">${esc(de)} ${hasTTS ? `<button class="say" data-say="${esc(de.replace(/…|→.*$/g, ""))}">🔊</button>` : ""}</div><div class="exfa fa">${esc(fa)}</div></div>`).join("")}
            </section>`).join("")}
          ${t.table ? `<div class="lab" style="margin-top:14px">Überblick · <span class="fa">جمع‌بندی</span></div>
            <div class="tbl-wrap"><table class="gtable">${t.table.map(r => `<tr><td><b>${esc(r[0])}</b></td><td>${esc(r[1])}</td><td><i>${esc(r[2])}</i></td><td class="fa">${esc(r[3])}</td></tr>`).join("")}</table></div>` : ""}
          <div class="actions-left"><button class="btn primary" data-startq="${t.id}">Übungen zu „${esc(t.title)}“</button></div>
        </article>`).join("") +
        `<div class="actions" style="justify-content:center;display:flex;margin-top:12px"><button class="btn primary" data-startq="">Alle Übungen starten · <span class="fa">شروع همه‌ی تمرین‌ها</span></button></div>`;
    } else {
      app.innerHTML = tabs + `<div id="gq"></div>`;
      renderQuiz();
    }
    app.querySelectorAll("[data-gv]").forEach(b => b.onclick = () => { state.gview = b.dataset.gv; if (state.gview === "quiz") state.gquiz = null; renderGrammar(); });
    app.querySelectorAll("[data-startq]").forEach(b => b.onclick = () => startQuiz(b.dataset.startq));
    bindCommon(app);
  }
  function startQuiz(topic, onlyQs) {
    const L = lesson();
    state.gtopic = topic || "";
    const qs = onlyQs || (L.quiz || []).filter(q => !topic || q.t === topic);
    state.gquiz = { queue: shuffle(qs), total: qs.length, n: 0, right: 0, wrong: [], done: false, review: !!onlyQs };
    state.gview = "quiz";
    if (state.mode !== "grammar") { setMode("grammar", { keepGrammar: true }); return; }
    renderGrammar();
  }
  function renderQuiz() {
    const box = $("#gq");
    if (!state.gquiz) startQuizInline();
    const G = state.gquiz;
    if (!G.queue.length) return renderQuizDone(box);
    const q = G.queue[0];
    const topic = (lesson().grammar || []).find(t => t.id === q.t);
    const body = q.type === "mc"
      ? `<div class="choices gchoices">${q.opts.map((o, k) => `<button class="choice" data-k="${k}"><span class="k">${k + 1}</span>${esc(o)}</button>`).join("")}</div>`
      : `<form class="answer-box" id="gf" autocomplete="off"><input id="gans" lang="de" spellcheck="false" autocapitalize="off" placeholder="Antwort …" aria-label="Antwort"><button class="btn primary" type="submit">Prüfen</button></form>`;
    box.innerHTML = `
      ${G.review ? `<div class="banner"><b>Grammatikfehler wiederholen</b> · <span class="fa">مرور سؤال‌هایی که اشتباه جواب دادی</span></div>` : ""}
      ${progressBar(G.n, G.total, `<span class="tally"><span class="g">✓ ${G.right}</span></span>`)}
      <div class="panel">
        <div class="lab">${esc(topic ? topic.title : "")} · <span class="fa">${esc(topic ? topic.title_fa : "")}</span></div>
        <div class="gq">${esc(q.q).replace("___", '<span class="blank">___</span>')}</div>
        ${body}
        <div class="feedback" id="gfb"></div>
      </div>`;
    if (q.type === "mc") box.querySelectorAll(".choice").forEach(b => b.onclick = () => answerQuiz(+b.dataset.k));
    else { const i = $("#gans"); i.focus(); $("#gf").onsubmit = e => { e.preventDefault(); G.done ? nextQuiz() : answerQuiz(i.value); }; }
  }
  function startQuizInline() {
    const L = lesson(); const qs = (L.quiz || []).filter(q => !state.gtopic || q.t === state.gtopic);
    state.gquiz = { queue: shuffle(qs), total: qs.length, n: 0, right: 0, wrong: [], done: false, review: false };
  }
  const gnorm = s => s.toLowerCase().replace(/[.,!?;:„“"']/g, "").replace(/\s+/g, " ").trim();
  function answerQuiz(ans) {
    const G = state.gquiz; if (G.done) return;
    G.done = true;
    const q = G.queue[0];
    let ok;
    if (q.type === "mc") {
      ok = ans === q.a;
      $("#gq").querySelectorAll(".choice").forEach(b => {
        b.disabled = true; const k = +b.dataset.k;
        if (k === q.a) b.classList.add("right"); else if (k === ans) b.classList.add("wrong");
      });
    } else {
      ok = q.a.map(gnorm).includes(gnorm(ans));
      const i = $("#gans"); i.readOnly = true; i.classList.add(ok ? "right" : "wrong");
    }
    G.n++;
    if (ok) { G.right++; if (G.review) clearMistake("g", q.id); }
    else { G.wrong.push(q); addMistake("g", q.id); }
    const solution = q.type === "mc" ? q.opts[q.a] : q.a.join(" / ");
    $("#gfb").innerHTML = `
      <span class="${ok ? "ok" : "no"}">${ok ? "Richtig! · <span class='fa'>درست است!</span>" : "Leider falsch. · <span class='fa'>اشتباه بود.</span>"}</span>
      ${ok ? "" : `<div class="sol">Lösung: <b>${esc(solution)}</b></div>`}
      <div class="explain"><div>${esc(q.de)}</div><div class="fa">${esc(q.fa)}</div></div>
      <div style="margin-top:12px"><button class="btn primary" id="gcont">Weiter (Enter)</button></div>`;
    $("#gcont").onclick = nextQuiz;
    $("#gcont").focus();
    updateStats();
  }
  function nextQuiz() { const G = state.gquiz; G.queue.shift(); G.done = false; renderQuiz(); }
  function renderQuizDone(box) {
    const G = state.gquiz;
    const pct = G.total ? Math.round(100 * G.right / G.total) : 0;
    box.innerHTML = `
      <div class="panel done">
        <div class="lab">Grammatik-Ergebnis · <span class="fa">نتیجه‌ی گرامر</span></div>
        <div class="score">${pct}%</div>
        <div>${G.right} von ${G.total} richtig</div>
        ${G.wrong.length ? `<div class="missed"><div class="lab">Falsch beantwortet · <span class="fa">سؤال‌هایی که اشتباه جواب دادی</span></div>
          ${G.wrong.map(q => `<div class="mrow"><span>${esc(q.q)}</span><b>${esc(q.type === "mc" ? q.opts[q.a] : q.a.join(" / "))}</b></div>`).join("")}</div>` : ""}
        <div class="actions">
          ${G.wrong.length ? `<button class="btn primary" id="gwrong">Falsche wiederholen (${G.wrong.length})</button>` : ""}
          <button class="btn" id="gagain">Alle noch einmal</button>
          <button class="btn" id="gexp">Zur Erklärung</button>
        </div>
      </div>`;
    const w = $("#gwrong"); if (w) w.onclick = () => startQuiz(state.gtopic, G.wrong.slice());
    $("#gagain").onclick = () => startQuiz(state.gtopic);
    $("#gexp").onclick = () => { state.gview = "explain"; renderGrammar(); };
  }

  // ---------- mistakes ----------
  function renderMistakes() {
    const cards = mistakeCards(), qs = mistakeQs();
    const m = mbox();
    const sorted = cards.slice().sort((a, b) => (m.w[b.id] || 0) - (m.w[a.id] || 0));
    app.innerHTML = `
      <div class="panel">
        <h2 class="mtitle">Meine Fehler · ${esc(lesson().title)} <span class="fa">اشتباه‌های من</span></h2>
        <p class="muted">Alles, was du in Karteikarten, Lernen, Schreiben und Grammatik falsch beantwortet hast. Im Fehler-Training wird jedes richtig beantwortete Wort von der Liste gestrichen.</p>
        <p class="muted fa" style="text-align:right">هر چیزی که در کارت‌ها، چندگزینه‌ای، نوشتن یا گرامر اشتباه جواب داده‌ای این‌جا می‌آید. در مرور اشتباه‌ها، هر مورد را که درست جواب بدهی از فهرست حذف می‌شود.</p>
      </div>
      <section class="panel" style="margin-top:12px">
        <div class="mhead"><h3>Wörter (${cards.length})</h3>
          ${cards.length ? `<div class="mbtns">
            <button class="btn primary" data-review="learn">Wiederholen: Lernen</button>
            <button class="btn" data-review="cards">Karteikarten</button>
            <button class="btn" data-review="write">Schreiben</button></div>` : ""}
        </div>
        ${cards.length ? `<div class="mlist">${sorted.map(c => `
          <div class="mrow"><span><b>${esc(c.w)}</b> <span class="cnt">×${m.w[c.id]}</span></span><span class="fa">${esc(c.fa)}</span>
          <button class="link" data-del-w="${c.id}" title="Entfernen">✕</button></div>`).join("")}</div>`
          : `<div class="empty">Keine offenen Wortfehler. 🎉 <span class="fa">هیچ اشتباهی در لغت‌ها نداری.</span></div>`}
      </section>
      <section class="panel" style="margin-top:12px">
        <div class="mhead"><h3>Grammatik (${qs.length})</h3>
          ${qs.length ? `<div class="mbtns"><button class="btn primary" id="greview">Grammatikfehler wiederholen</button></div>` : ""}
        </div>
        ${qs.length ? `<div class="mlist">${qs.map(q => `
          <div class="mrow"><span>${esc(q.q)} <span class="cnt">×${m.g[q.id]}</span></span><b>${esc(q.type === "mc" ? q.opts[q.a] : q.a.join(" / "))}</b>
          <button class="link" data-del-g="${q.id}" title="Entfernen">✕</button></div>`).join("")}</div>`
          : `<div class="empty">Keine offenen Grammatikfehler. <span class="fa">اشتباه گرامری نداری.</span></div>`}
      </section>
      ${cards.length || qs.length ? `<div class="subctrl"><button class="link" id="clearAll">Liste leeren</button></div>` : ""}`;
    app.querySelectorAll("[data-review]").forEach(b => b.onclick = () => setMode(b.dataset.review, { deck: mistakeCards() }));
    const gr = $("#greview"); if (gr) gr.onclick = () => startQuiz("", mistakeQs());
    app.querySelectorAll("[data-del-w]").forEach(b => b.onclick = () => { clearMistake("w", b.dataset.delW); render(); });
    app.querySelectorAll("[data-del-g]").forEach(b => b.onclick = () => { clearMistake("g", b.dataset.delG); render(); });
    const ca = $("#clearAll");
    if (ca) ca.onclick = () => { if (confirm("Alle Fehler dieser Lektion löschen?")) { store.mistakes[String(lesson().id)] = { w: {}, g: {} }; persist(); render(); } };
  }

  // ---------- list ----------
  function renderList() {
    const items = pool();
    app.innerHTML = `<input class="search" id="q" placeholder="Suchen … / جستجو" aria-label="Suchen">
      <div class="list" id="lst"></div>`;
    const draw = q => {
      q = (q || "").toLowerCase();
      const L = lesson();
      let html = "", lastSec = null, count = 0;
      items.forEach(c => {
        const hay = (c.w + " " + c.fa + " " + c.syn + " " + c.de + " " + c.fas).toLowerCase();
        if (q && !hay.includes(q)) return;
        if (c.s !== lastSec) { lastSec = c.s; const s = L.sections.find(x => x.id === c.s); html += `<div class="sec-title">${c.s} · ${esc(s ? s.title : "")}</div>`; }
        count++;
        html += `<div class="item">
          <button class="tool star ${store.starred[c.id] ? "on" : ""}" data-star="${c.id}" title="Markieren">★</button>
          <div><div class="w">${esc(c.w)}${store.known[c.id] ? '<span class="known-dot" title="gelernt"></span>' : ""}
            ${hasTTS ? `<button class="say" data-say="${esc(cleanWord(c.w))}">🔊</button>` : ""}</div>
            <div class="m fa" style="text-align:left">${esc(c.fa)}</div><div class="s">≈ ${esc(c.syn)}</div></div>
          <div class="col2"><div class="e">${esc(c.de)}</div><div class="ef fa">${esc(c.fas)}</div></div>
        </div>`;
      });
      $("#lst").innerHTML = count ? html : `<div class="empty">Nichts gefunden.</div>`;
      bindCommon($("#lst"));
    };
    $("#q").oninput = e => draw(e.target.value);
    draw("");
  }

  // ---------- shared bindings ----------
  function bindCommon(root) {
    root.querySelectorAll("[data-say]").forEach(b => b.onclick = e => { e.stopPropagation(); speak(b.dataset.say); });
    root.querySelectorAll("[data-goto]").forEach(b => b.onclick = () => setMode(b.dataset.goto));
    root.querySelectorAll("[data-star]").forEach(b => b.onclick = e => {
      e.stopPropagation();
      const id = b.dataset.star;
      store.starred[id] ? delete store.starred[id] : (store.starred[id] = true);
      persist();
      document.querySelectorAll(`[data-star="${id}"]`).forEach(x => x.classList.toggle("on", !!store.starred[id]));
      updateStats();
    });
  }

  document.addEventListener("keydown", e => {
    if (e.target.matches("input, select, textarea")) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (state.mode === "cards" && state.i < state.deck.length) {
      const c = state.deck[state.i];
      if (e.key === " " || e.key === "ArrowUp" || e.key === "ArrowDown") { e.preventDefault(); flip(); }
      else if (e.key === "ArrowRight") go(1);
      else if (e.key === "ArrowLeft") go(-1);
      else if (e.key === "1") judge(false);
      else if (e.key === "2") judge(true);
      else if (e.key.toLowerCase() === "s") { const b = $(`[data-star="${c.id}"]`); if (b) b.click(); }
      else if (e.key.toLowerCase() === "a") speak(cleanWord(c.w));
    } else if (state.mode === "learn" && state.learn) {
      if (/^[1-4]$/.test(e.key) && !state.learn.answered) { const b = app.querySelectorAll(".choice")[+e.key - 1]; if (b) b.click(); }
    } else if (state.mode === "grammar" && state.gview === "quiz" && state.gquiz && !state.gquiz.done) {
      if (/^[1-4]$/.test(e.key)) { const b = app.querySelectorAll(".gchoices .choice")[+e.key - 1]; if (b) b.click(); }
    }
  });

  if (!LESSONS.length) { app.innerHTML = `<div class="panel empty">Keine Daten gefunden.</div>`; return; }
  initChrome();
  restart();
})();
