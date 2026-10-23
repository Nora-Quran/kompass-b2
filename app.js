/* Kompass DaF B2 – Karteikarten. No build step, no dependencies. */
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
    known: saved.known || {},      // id -> true
    starred: saved.starred || {},  // id -> true
    dir: saved.dir || "de",        // front side language: "de" | "fa"
    lesson: saved.lesson || (LESSONS[0] && LESSONS[0].id),
    theme: saved.theme || null,
  };
  const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(store)); } catch { /* private mode etc. */ } };

  // ---------- state ----------
  const state = {
    mode: "cards",
    sections: new Set(),   // empty = all
    starOnly: false,
    unknownOnly: false,
    deck: [], i: 0, flipped: false,
    round: { good: 0, bad: 0, missed: [] },
    learn: null, write: null,
  };

  const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const lesson = () => LESSONS.find(l => l.id === store.lesson) || LESSONS[0];

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
  // headword without grammar notes, for reading aloud / checking answers
  function cleanWord(w) {
    return w.replace(/\([^)]*\)/g, "").split(/\s*[\/≠]\s*/)[0]
      .replace(/,.*$/, "").replace(/\s*\+\s*[ADG]\b.*$/, "").replace(/\s+/g, " ").trim();
  }

  // ---------- header / filters ----------
  function initChrome() {
    const sel = $("#lesson");
    sel.innerHTML = LESSONS.map(l => `<option value="${l.id}">${esc(l.title)} (${l.cards.length})</option>`).join("");
    sel.value = store.lesson;
    sel.onchange = () => { store.lesson = +sel.value; persist(); state.sections.clear(); renderChips(); restart(); };

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
  function setMode(m) {
    state.mode = m;
    document.querySelectorAll(".modes button").forEach(b => b.classList.toggle("active", b.dataset.mode === m));
    restart();
  }
  function updateStats() {
    const L = lesson(); const total = L.cards.length;
    const known = L.cards.filter(c => store.known[c.id]).length;
    const stars = L.cards.filter(c => store.starred[c.id]).length;
    $("#stats").textContent = `${L.title}: ${known} / ${total} gelernt · ${stars} markiert`;
  }

  function restart() {
    state.deck = shuffleOn ? shuffle(pool()) : pool();
    state.i = 0; state.flipped = false; state.round = { good: 0, bad: 0, missed: [] };
    state.learn = null; state.write = null;
    render();
  }
  let shuffleOn = false;

  function render() {
    updateStats();
    if (state.mode === "cards") return renderCards();
    if (state.mode === "learn") return renderLearn();
    if (state.mode === "write") return renderWrite();
    return renderList();
  }

  const emptyMsg = () => `<div class="panel empty">Keine Karten für diese Auswahl.<br><span class="fa">کارتی با این فیلتر وجود ندارد.</span></div>`;
  const progressBar = (n, total, extra = "") =>
    `<div class="progress"><span>${Math.min(n, total)} / ${total}</span><div class="bar"><i style="width:${total ? (100 * n / total) : 0}%"></i></div>${extra}</div>`;

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
    const front = faFront
      ? `<div class="big fa">${esc(c.fa)}</div>`
      : `<div class="big">${esc(c.w)}</div>`;
    const sec = lesson().sections.find(s => s.id === c.s);
    app.innerHTML = `
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
        <button class="link" id="shuf">${shuffleOn ? "Reihenfolge: gemischt ✓" : "Karten mischen"}</button>
        <button class="link" id="reset">Neu starten</button>
      </div>`;
    const card = $("#card");
    card.onclick = e => { if (e.target.closest(".tool,.say")) return; flip(); };
    bindCommon(app);
    $("#prev").onclick = () => go(-1);
    $("#next").onclick = () => go(1);
    $("#bad").onclick = () => judge(false);
    $("#good").onclick = () => judge(true);
    $("#shuf").onclick = () => { shuffleOn = !shuffleOn; restart(); };
    $("#reset").onclick = restart;
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
    if (ok) { store.known[c.id] = true; state.round.good++; }
    else { delete store.known[c.id]; state.round.bad++; state.round.missed.push(c); }
    persist();
    const el = $("#card");
    if (el) { el.classList.add(ok ? "swipe-right" : "swipe-left"); }
    setTimeout(() => { state.i++; state.flipped = false; render(); }, 160);
  }
  function renderCardsDone() {
    const r = state.round, total = r.good + r.bad;
    app.innerHTML = `
      <div class="panel done">
        <div class="lab">Runde beendet · <span class="fa">پایان دور</span></div>
        <div class="score">${r.good} / ${total || state.deck.length}</div>
        <div>gewusst${r.bad ? ` · <b>${r.bad}</b> noch zu lernen` : " – alles gewusst! 🎉"}</div>
        <div class="actions">
          ${r.missed.length ? `<button class="btn primary" id="again">✗-Karten wiederholen (${r.missed.length})</button>` : ""}
          <button class="btn" id="restart">Alle Karten neu</button>
          <button class="btn" id="tolearn">Weiter mit „Lernen“</button>
        </div>
      </div>`;
    const again = $("#again");
    if (again) again.onclick = () => { state.deck = shuffle(r.missed); state.i = 0; state.flipped = false; state.round = { good: 0, bad: 0, missed: [] }; render(); };
    $("#restart").onclick = restart;
    $("#tolearn").onclick = () => setMode("learn");
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
    if (d.length < 4) { app.innerHTML = d.length ? `<div class="panel empty">Für „Lernen“ braucht man mindestens 4 Karten.</div>` : emptyMsg(); return; }
    if (!state.learn) state.learn = { queue: shuffle(d), n: 0, right: 0, wrongSet: new Set(), answered: false };
    const L = state.learn;
    if (!L.queue.length) return renderScore(L.right, L.n, "learn");
    const c = L.queue[0];
    const faFront = store.dir === "fa";
    if (!L.opts || L.opts.card !== c) {
      const others = shuffle(lesson().cards.filter(x => x.id !== c.id && x.fa !== c.fa)).slice(0, 3);
      L.opts = { card: c, list: shuffle([c, ...others]) };
    }
    const prompt = faFront ? `<div class="big fa">${esc(c.fa)}</div>` : `<div class="big">${esc(c.w)}</div>`;
    const optHtml = L.opts.list.map((o, k) =>
      `<button class="choice ${faFront ? "" : "fa"}" data-id="${o.id}"><span class="k">${k + 1}</span>${esc(faFront ? o.w : o.fa)}</button>`).join("");
    app.innerHTML = `
      ${progressBar(L.n, L.n + L.queue.length, `<span class="tally"><span class="g">✓ ${L.right}</span></span>`)}
      <div class="panel">
        <div class="q"><div class="lab">${faFront ? "Welches deutsche Wort passt?" : "Was bedeutet das? · <span class='fa'>معنی‌اش چیست؟</span>"}</div>
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
      if (!L.wrongSet.has(c.id)) { L.right++; store.known[c.id] = true; persist(); }
      fb.innerHTML = `<span class="ok">Richtig! · <span class="fa">درست است!</span></span>`;
      setTimeout(nextLearn, 750);
    } else {
      L.wrongSet.add(c.id); delete store.known[c.id]; persist();
      fb.innerHTML = `<span class="no">Leider falsch.</span><div class="reveal" style="text-align:left">
        <b>${esc(c.w)}</b> — <span class="fa">${esc(c.fa)}</span>${backDetails(c)}</div>
        <div style="margin-top:12px"><button class="btn primary" id="cont">Weiter (Enter)</button></div>`;
      bindCommon(fb);
      $("#cont").onclick = nextLearn;
    }
  }
  function nextLearn() {
    const L = state.learn; if (!L) return;
    const c = L.queue.shift();
    L.n++;
    // wrong answers come back later in the round (like Quizlet "Learn")
    if (L.wrongSet.has(c.id) && !c._requeued) { const pos = Math.min(L.queue.length, 3 + Math.floor(Math.random() * 3)); L.queue.splice(pos, 0, Object.assign(Object.create(c), c, { _requeued: true })); L.n--; }
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
      let t = p.replace(/,.*$/, "").replace(/\s*\+\s*[ADG]\b.*$/, "").trim();
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
    if (!state.write) state.write = { queue: shuffle(d), n: 0, right: 0, done: false };
    const W = state.write;
    if (!W.queue.length) return renderScore(W.right, W.n, "write");
    const c = W.queue[0];
    app.innerHTML = `
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
    const inp = $("#ans"); inp.focus();
    $("#wf").onsubmit = e => { e.preventDefault(); W.done ? nextWrite() : checkWrite(inp.value); };
    $("#dunno").onclick = () => checkWrite("");
  }
  function checkWrite(val) {
    const W = state.write; if (W.done) return;
    W.done = true;
    const c = W.queue[0]; const inp = $("#ans");
    const v = norm(val); const acc = accepted(c);
    let ok = v && acc.includes(v);
    const close = !ok && v && acc.some(a => lev(a, v) <= (a.length > 6 ? 2 : 1));
    inp.classList.add(ok ? "right" : "wrong"); inp.readOnly = true;
    const fb = $("#fb");
    const reveal = `<div class="reveal" style="text-align:left"><b>${esc(c.w)}</b> — <span class="fa">${esc(c.fa)}</span>${backDetails(c)}</div>`;
    const record = good => { if (good) { W.right++; store.known[c.id] = true; } else delete store.known[c.id]; persist(); };
    if (ok) {
      record(true);
      fb.innerHTML = `<span class="ok">Richtig! · <span class="fa">درست است!</span></span>${reveal}<div style="margin-top:12px"><button class="btn primary" id="cont">Weiter (Enter)</button></div>`;
    } else {
      record(false);
      fb.innerHTML = `<span class="no">${close ? "Fast! Kleiner Tippfehler." : val ? "Leider falsch." : "Die Lösung:"}</span>${reveal}
        <div style="margin-top:12px;display:flex;gap:8px;justify-content:center;flex-wrap:wrap">
          ${val ? `<button class="btn" id="override">Ich hatte recht</button>` : ""}
          <button class="btn primary" id="cont">Weiter (Enter)</button></div>`;
      const o = $("#override"); if (o) o.onclick = () => { record(true); nextWrite(); };
    }
    bindCommon(fb);
    $("#cont").onclick = nextWrite;
    $("#cont").focus();
  }
  function nextWrite() { const W = state.write; W.queue.shift(); W.n++; W.done = false; render(); }

  function renderScore(right, n, mode) {
    const pct = n ? Math.round(100 * right / n) : 0;
    app.innerHTML = `
      <div class="panel done">
        <div class="lab">Ergebnis · <span class="fa">نتیجه</span></div>
        <div class="score">${pct}%</div>
        <div>${right} von ${n} beim ersten Versuch richtig</div>
        <div class="actions"><button class="btn primary" id="again">Noch einmal</button>
        <button class="btn" id="unk">Nur ungelernte üben</button></div>
      </div>`;
    $("#again").onclick = restart;
    $("#unk").onclick = () => { $("#unknownOnly").checked = true; state.unknownOnly = true; restart(); };
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
    if (e.target.matches("input, select, textarea") && !(state.mode === "write" && e.key === "Enter")) return;
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
      else if (e.key === "Enter" && state.learn.answered) { const b = $("#cont"); if (b) b.click(); }
    }
  });

  if (!LESSONS.length) { app.innerHTML = `<div class="panel empty">Keine Daten gefunden.</div>`; return; }
  initChrome();
  restart();
})();
