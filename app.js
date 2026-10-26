/* Deutsch A1 / A2 / B2 – Karteikarten, Grammatik & Fehlertraining. No build step, no dependencies. */
(() => {
  "use strict";

  const LESSONS = (window.LESSONS || []).slice().sort((a, b) => a.id - b.id);
  const $ = (s, el = document) => el.querySelector(s);
  const app = $("#app");

  // ---------- storage (safe) ----------
  // Per-site settings (A1 / A2 / B2). The B2 root page has no SITE object, so it keeps its original storage key.
  const SITE = Object.assign({
    key: "kompass-b2-flashcards-v1",
    bookLabel: "Kompass DaF B2",
    extraLabel: "Zusatz: B1 / B2 (nicht im Buch)",
    noGrammarExtra: "Dieser Zusatz-Wortschatz hat keinen Grammatikteil. Die Grammatik findest du in Lektion 1–10.<br><span class=\"fa\">این بخش فقط واژگان است؛ گرامر در درس‌های ۱ تا ۱۰ است.</span>",
  }, window.SITE || {});
  const KEY = SITE.key;
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } };
  const saved = load();
  const store = {
    known: saved.known || {},        // cardId -> true
    starred: saved.starred || {},    // cardId -> true
    mistakes: saved.mistakes || {},  // lessonId -> { w: {cardId: n}, g: {questionId: n} }
    dir: saved.dir || "de",
    lesson: saved.lesson || (LESSONS[0] && LESSONS[0].id),
    theme: saved.theme || null,
    auto: !!saved.auto,   // read the German word aloud automatically
    voice: saved.voice || "",                         // chosen German voice (name)
    rate: saved.rate || (saved.slow ? 0.75 : 1),      // speech speed
    play: Object.assign({ ex: true, coll: false, fa: false }, saved.play || {}),
    dailyDone: saved.dailyDone || {},
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
  // Uses the browser's built-in speech synthesis (Web Speech API) with a German voice.
  const sysTTS = "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;
  const hasTTS = sysTTS || typeof Audio !== "undefined";
  let deVoice = null, faVoice = null, voicesLoaded = false, deVoices = [];
  // Higher score = more natural voice (cloud / neural voices first).
  function voiceScore(x) {
    let s = 0;
    if (/natural|neural|online|wavenet/i.test(x.name)) s += 6;
    if (/google/i.test(x.name)) s += 4;
    if (/premium|enhanced|siri|verbessert/i.test(x.name)) s += 4;
    if (/katja|conrad|amala|seraphina|florian|anna|petra|helena|markus|yannick|viktoria/i.test(x.name)) s += 1;
    if (/de[-_]DE/i.test(x.lang)) s += 2;
    if (/espeak|compact/i.test(x.name)) s -= 5;
    return s;
  }
  function pickVoice() {
    if (!sysTTS) return;
    const v = speechSynthesis.getVoices();
    if (v.length) voicesLoaded = true;
    deVoices = v.filter(x => /^de([-_]|$)/i.test(x.lang)).sort((a, b) => voiceScore(b) - voiceScore(a));
    deVoice = deVoices.find(x => x.name === store.voice) || deVoices[0] || null;
    faVoice = v.filter(x => /^fa([-_]|$)/i.test(x.lang)).sort((a, b) => voiceScore(b) - voiceScore(a))[0] || null;
    updateVoiceNote();
    if (typeof settingsOpen !== "undefined" && settingsOpen) renderSettings();
  }
  if (sysTTS) { pickVoice(); speechSynthesis.onvoiceschanged = pickVoice; setTimeout(() => { voicesLoaded = true; pickVoice(); }, 2500); }
  // ---------- audio engine ----------
  // 1) real human recordings of single words (Wiktionary / Wikimedia Commons, free licences),
  // 2) optional neural voice that runs in the browser (Piper "Thorsten", downloaded once),
  // 3) the system voice (Web Speech API) as fallback.
  const cleanSay = t => String(t || "").replace(/_{2,}/g, " … ").replace(/\s+/g, " ").trim();
  const player = typeof Audio !== "undefined" ? new Audio() : null;
  let playerRes = null, playerTimer = null;
  const SILENT = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=";
  if (player) {
    player.preload = "auto";
    const unlock = () => { try { player.src = SILENT; const p = player.play(); if (p) p.catch(() => {}); } catch (e) {} document.removeEventListener("pointerdown", unlock, true); };
    document.addEventListener("pointerdown", unlock, true);
  }
  function stopPlayer() {
    clearTimeout(playerTimer);
    if (player) { try { player.pause(); } catch (e) {} }
    const r = playerRes; playerRes = null; if (r) r();
  }
  function stopAll() { stopPlayer(); if (sysTTS) speechSynthesis.cancel(); }
  function playUrl(url) {
    return new Promise((res, rej) => {
      if (!player) return rej(new Error("no audio"));
      stopPlayer();
      const done = () => { clearTimeout(playerTimer); if (playerRes === res) playerRes = null; res(); };
      playerRes = res;
      player.onended = done;
      player.onerror = () => { clearTimeout(playerTimer); if (playerRes === res) playerRes = null; rej(new Error("audio error")); };
      player.src = url;
      try { player.preservesPitch = true; } catch (e) {}
      player.defaultPlaybackRate = store.rate; player.playbackRate = store.rate;
      player.onloadedmetadata = () => { player.playbackRate = store.rate; };
      playerTimer = setTimeout(done, 30000);
      const p = player.play();
      if (p) p.catch(e => { clearTimeout(playerTimer); if (playerRes === res) playerRes = null; rej(e); });
    });
  }

  // --- 1) human recordings from Wiktionary
  const HUMAN_KEY = "kompass-human-audio-v1";
  let humanCache = {};
  try { humanCache = JSON.parse(localStorage.getItem(HUMAN_KEY) || "{}") || {}; } catch (e) {}
  const humanPending = new Map();
  const canOgg = (() => { try { return !!(player && player.canPlayType('audio/ogg; codecs="vorbis"')); } catch (e) { return false; } })();
  function humanWord(text) {
    const t = cleanSay(text).replace(/[.!?]$/, "").replace(/^(der|die|das|sich)\s+/i, "").trim();
    return /^[A-Za-zÄÖÜäöüß]+(-[A-Za-zÄÖÜäöüß]+)?$/.test(t) && t.length > 1 ? t : null;
  }
  const reEsc = x => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  function findHuman(word) {
    if (word in humanCache) return Promise.resolve(humanCache[word]);
    if (humanPending.has(word)) return humanPending.get(word);
    const api = "https://de.wiktionary.org/w/api.php?action=query&format=json&origin=*&generator=images&gimlimit=50&prop=imageinfo&iiprop=url&titles=" + encodeURIComponent(word);
    const p = fetch(api).then(r => r.json()).then(j => {
      const pages = Object.values((j.query && j.query.pages) || {});
      const re = new RegExp("(^De-|^LL-Q188 \\(deu\\)-.*-)" + reEsc(word) + "\\d?\\.(ogg|oga|wav|mp3|flac|opus)$", "i");
      const files = pages.filter(f => f.imageinfo && f.imageinfo[0] && re.test(f.title.replace(/^[^:]+:/, "")));
      const rank = f => { const n = f.title.replace(/^[^:]+:/, ""); return (n.toLowerCase().startsWith("de-" + word.toLowerCase() + ".") ? 4 : 0) + (/^De-/i.test(n) ? 2 : 0) + (/\.wav$/i.test(n) ? 1 : 0); };
      files.sort((a, b) => rank(b) - rank(a));
      const url = files.length ? files[0].imageinfo[0].url : "";
      humanCache[word] = url;
      try { localStorage.setItem(HUMAN_KEY, JSON.stringify(humanCache)); } catch (e) {}
      return url;
    }).catch(() => "").finally(() => humanPending.delete(word));
    humanPending.set(word, p);
    return p;
  }
  function playableUrl(url) {
    if (/\.(ogg|oga|opus|flac)$/i.test(url) && !canOgg) {
      const m = url.match(/^(https:\/\/upload\.wikimedia\.org\/wikipedia\/commons\/)(.+\/)([^/]+)$/);
      if (m) return m[1] + "transcoded/" + m[2] + m[3] + "/" + m[3] + ".mp3";
    }
    return url;
  }
  // Look up recordings in advance (so playback starts at once).
  function prefetchHuman(texts) {
    if (store.human === false) return;
    texts.forEach(t => { const w = humanWord(t); if (w && !(w in humanCache)) findHuman(w); });
  }

  // --- 2) neural voice in the browser (Piper, voice "Thorsten")
  const NEURAL_VOICE = "de_DE-thorsten-medium";
  const NEURAL_LIBS = ["https://cdn.jsdelivr.net/npm/@diffusionstudio/vits-web@1.0.3/+esm", "https://esm.sh/@diffusionstudio/vits-web@1.0.3"];
  let neural = null, neuralState = "off", neuralMsg = "", neuralProgress = 0;
  const neuralCache = new Map();
  async function importNeural() {
    let last;
    for (const u of NEURAL_LIBS) { try { return await import(u); } catch (e) { last = e; } }
    throw last;
  }
  async function loadNeural(download) {
    if (neural) return neural;
    if (neuralState === "loading") return null;
    neuralState = "loading"; neuralMsg = ""; neuralProgress = 0; refreshSettings();
    try {
      const mod = await importNeural();
      const stored = (await mod.stored().catch(() => [])) || [];
      if (!stored.includes(NEURAL_VOICE)) {
        if (!download) { neuralState = "off"; refreshSettings(); return null; }
        const parts = {};
        await mod.download(NEURAL_VOICE, p => {
          if (p && p.total) { parts[p.url] = [p.loaded, p.total]; const v = Object.values(parts); neuralProgress = v.reduce((a, x) => a + x[0], 0) / v.reduce((a, x) => a + x[1], 0); refreshSettings(true); }
        });
      }
      await mod.predict({ text: "Hallo.", voiceId: NEURAL_VOICE });   // warm-up
      neural = mod; neuralState = "ready"; refreshSettings();
      return mod;
    } catch (e) {
      console.warn("Neural voice:", e);
      neuralState = "error"; neuralMsg = String(e && e.message || e).slice(0, 140); refreshSettings();
      return null;
    }
  }
  async function neuralUrl(text) {
    if (neuralCache.has(text)) return neuralCache.get(text);
    const blob = await neural.predict({ text, voiceId: NEURAL_VOICE });
    const u = URL.createObjectURL(blob);
    neuralCache.set(text, u);
    if (neuralCache.size > 300) { const k = neuralCache.keys().next().value; URL.revokeObjectURL(neuralCache.get(k)); neuralCache.delete(k); }
    return u;
  }
  if (store.engine === "neural") setTimeout(() => loadNeural(false), 800);

  // --- 3) system voice
  function sysUtter(text, lang) {
    return new Promise(res => {
      if (!sysTTS || !text) return res();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = lang === "fa" ? "fa-IR" : "de-DE";
      const v = lang === "fa" ? faVoice : deVoice; if (v) u.voice = v;
      u.rate = store.rate;
      let done = false;
      const fin = () => { if (!done) { done = true; clearTimeout(t); res(); } };
      const t = setTimeout(fin, 2000 + text.length * 140 / store.rate);
      u.onend = fin; u.onerror = fin;
      speechSynthesis.speak(u);
    });
  }
  // Speak and wait until finished (used everywhere, also in the listening mode).
  async function utter(text, lang = "de") {
    text = cleanSay(text);
    if (!text) return;
    if (lang === "de") {
      if (store.human !== false) {
        const w = humanWord(text);
        if (w) { const url = await findHuman(w); if (url) { try { await playUrl(playableUrl(url)); return; } catch (e) { if (playableUrl(url) !== url) { try { await playUrl(url); return; } catch (e2) {} } } } }
      }
      if (store.engine === "neural" && neural) {
        try { await playUrl(await neuralUrl(text)); return; } catch (e) { console.warn(e); }
      }
    }
    return sysUtter(text, lang);
  }
  let speakToken = 0;
  function speak(text) {
    stopAll();
    const my = ++speakToken;
    text = cleanSay(text);
    if (!text) return;
    // Keep the click "user gesture" for the system voice when no other source applies.
    const w = store.human !== false ? humanWord(text) : null;
    if (!(w && humanCache[w] !== "") && !(store.engine === "neural" && neural)) { sysUtter(text, "de"); return; }
    utter(text).then(() => {}, () => {}); void my;
  }
  const wait = ms => new Promise(r => setTimeout(r, ms));
  // Text to read aloud for a headword: drop grammar notes and plural markers, read both parts of "A / B" and "A ≠ B".
  function noParens(t) { let o; do { o = t; t = t.replace(/\s*\([^()]*\)/g, " "); } while (t !== o); return t.replace(/\s+([,.!?;:])/g, "$1"); }
  function sayWord(w) {
    return noParens(w).split(/\s*[\/≠;]\s*/)
      .map(p => p.replace(/,.*$/, "").replace(/\s*\+\s*[ADG]\b.*$/, "").replace(/[~=≈]/g, " ").replace(/\s+/g, " ").trim())
      .filter(Boolean).join(", ");
  }
  const sayText = t => noParens(String(t)).replace(/\b(vgl\.|ugs\.)/g, " ").replace(/[≈≠=~]/g, ",").replace(/\s+/g, " ").replace(/^[\s,]+|[\s,]+$/g, "");
  const sayBtn = (text, cls = "say", title = "Vorlesen") =>
    hasTTS && text ? `<button type="button" class="${cls}" data-say="${esc(text)}" title="${title}" aria-label="${title}">🔊</button>` : "";
  function updateVoiceNote() {
    let n = document.getElementById("voiceNote");
    const show = !sysTTS || (voicesLoaded && !deVoice);
    if (!show) { if (n) n.hidden = true; return; }
    if (!n) {
      n = document.createElement("p"); n.id = "voiceNote"; n.className = "lesson-note";
      const app = document.getElementById("app"); if (!app) return;
      app.parentNode.insertBefore(n, app);
    }
    n.innerHTML = !sysTTS
      ? `Dein Browser unterstützt keine Sprachausgabe. Bitte Chrome, Edge oder Safari benutzen.<span class="fa">مرورگر شما از خواندن متن پشتیبانی نمی‌کند؛ لطفاً از Chrome، Edge یا Safari استفاده کنید.</span>`
      : `Auf diesem Gerät ist keine deutsche Stimme installiert – die Aussprache kann falsch klingen. Installiere „Deutsch“ in den Sprach- bzw. Text-zu-Sprache-Einstellungen deines Geräts.<span class="fa">روی این دستگاه صدای آلمانی نصب نیست و تلفظ ممکن است درست نباشد. در تنظیمات دستگاه، بخش زبان / تبدیل متن به گفتار، زبان آلمانی را نصب کنید.</span>`;
    n.hidden = false;
  }
  function cleanWord(w) {
    return w.replace(/\([^)]*\)/g, "").split(/\s*[\/≠]\s*/)[0]
      .replace(/,.*$/, "").replace(/\s*\+\s*[ADG]\b.*$/, "").replace(/\s+/g, " ").trim();
  }

  // ---------- header / filters ----------
  function initChrome() {
    const sel = $("#lesson");
    const opt = l => `<option value="${l.id}">${esc(l.title)} (${l.cards.length})</option>`;
    const book = LESSONS.filter(l => l.id < 100), extra = LESSONS.filter(l => l.id >= 100);
    sel.innerHTML = `<optgroup label="${esc(SITE.bookLabel)}">${book.map(opt).join("")}</optgroup>` +
      (extra.length ? `<optgroup label="${esc(SITE.extraLabel)}">${extra.map(opt).join("")}</optgroup>` : "");
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
    initSettings();
    if (!(window.TAEGLICH || []).length) { const db = $("#dailyBtn"); if (db) db.hidden = true; }
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
    stopPlay();
    $(".filters").hidden = (["grammar", "mistakes", "artikel", "verben", "daily"].includes(m) || !!opts.deck);
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
    const note = $("#lessonNote");
    if (note) {
      const [de, fa] = (L.note || "").split(" · ");
      note.innerHTML = L.note ? `${esc(de)}${fa ? `<span class="fa">${esc(fa)}</span>` : ""}` : "";
      note.hidden = !L.note;
    }
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
      case "listen": return renderListen();
      case "artikel": return renderArtikel();
      case "verben": return renderVerben();
      case "daily": return renderDaily();
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
      <div class="row"><div class="lab">Synonym(e) ${sayBtn(sayText(c.syn))}</div><div class="syn">${esc(c.syn)}</div></div>
      <div class="row"><div class="lab">Beispiel ${sayBtn(c.de, "say", "Satz vorlesen (B)")} <span class="hint-tap">· Wort antippen = Bedeutung</span></div>
        <div class="ex">${sent(c.de)}</div><div class="exfa fa">${esc(c.fas)}</div></div>
      ${collHtml(c)}`;
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
              ${!faFront ? sayBtn(sayWord(c.w), "tool", "Vorlesen (A)") : ""}
              <button class="tool star ${star}" data-star="${c.id}" title="Markieren (S)">★</button>
            </div>
            ${front}
            <span class="hint">Klicken oder Leertaste zum Umdrehen</span>
          </div>
          <div class="face back">
            <div class="tools">
              ${sayBtn(sayWord(c.w), "tool", "Vorlesen (A)")}
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
    card.onclick = e => { if (e.target.closest(".tool,.say,.tok")) return; flip(); };
    bindCommon(app);
    $("#prev").onclick = () => go(-1);
    $("#next").onclick = () => go(1);
    $("#bad").onclick = () => judge(false);
    $("#good").onclick = () => judge(true);
    const sh = $("#shuf"); if (sh) sh.onclick = () => { shuffleOn = !shuffleOn; restart(); };
    $("#reset").onclick = () => restart(state.review ? { deck: mistakeCards() } : {});
    addSwipe(card);
    prefetchHuman(d.slice(state.i, state.i + 3).map(x => sayWord(x.w)));
    if (store.auto && !faFront && !state.flipped) speak(sayWord(c.w));
  }
  function flip() {
    state.flipped = !state.flipped; const el = $("#card"); if (el) el.classList.toggle("flipped", state.flipped);
    const c = state.deck[state.i];
    if (store.auto && state.flipped && store.dir === "fa" && c) speak(sayWord(c.w));
  }
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
      ${cards.map(c => `<div class="mrow"><span><b>${esc(c.w)}</b> ${sayBtn(sayWord(c.w))}</span><span class="fa">${esc(c.fa)}</span></div>`).join("")}</div>`;
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
          ${!faFront ? sayBtn(sayWord(c.w)) : ""}
        </div>
        <div class="choices">${optHtml}</div>
        <div class="feedback" id="fb"></div>
      </div>`;
    bindCommon(app);
    app.querySelectorAll(".choice").forEach(b => b.onclick = () => answerLearn(b.dataset.id));
    if (store.auto && !faFront) speak(sayWord(c.w));
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
      fb.innerHTML = `<span class="ok">Richtig! · <span class="fa">درست است!</span></span> <b>${esc(c.w)}</b> ${sayBtn(sayWord(c.w))}`;
      bindCommon(fb);
      if (store.auto) speak(sayWord(c.w));
      setTimeout(() => nextLearn(false), 750);
    } else {
      if (!L.wrongSet.has(c.id)) { L.wrongSet.add(c.id); L.wrongCards.push(c); L.n++; }
      wordWrong(c);
      fb.innerHTML = `<span class="no">Leider falsch. · <span class="fa">اشتباه بود.</span></span><div class="reveal" style="text-align:left">
        <b>${esc(c.w)}</b> ${sayBtn(sayWord(c.w))} — <span class="fa">${esc(c.fa)}</span>${backDetails(c)}</div>
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
    const reveal = `<div class="reveal" style="text-align:left"><b>${esc(c.w)}</b> ${sayBtn(sayWord(c.w))} — <span class="fa">${esc(c.fa)}</span>${backDetails(c)}</div>`;
    if (store.auto) speak(sayWord(c.w));
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
    if (!topics.length) {
      app.innerHTML = L.id >= 100
        ? `<div class="panel empty">${SITE.noGrammarExtra}</div>`
        : `<div class="panel empty">Für diese Lektion gibt es noch keine Grammatik.</div>`;
      return;
    }
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
              ${r.ex.map(([de, fa]) => `<div class="gex"><div class="ex">${sent(de)} ${sayBtn(de.replace(/…/g, " ").replace(/→/g, ". "))}</div><div class="exfa fa">${esc(fa)}</div></div>`).join("")}
            </section>`).join("")}
          ${t.table ? `<div class="lab" style="margin-top:14px">Überblick · <span class="fa">جمع‌بندی</span></div>
            <div class="tbl-wrap"><table class="gtable">${t.table.map(r => `<tr><td><b>${esc(r[0])}</b></td><td>${esc(r[1])}</td><td><i>${esc(r[2])}</i> ${sayBtn(r[2].replace(/…/g, " ").replace(/→/g, ". "))}</td><td class="fa">${esc(r[3])}</td></tr>`).join("")}</table></div>` : ""}
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
    if (q.type === "mc" && !G.order) G.order = shuffle(q.opts.map((_, k) => k));   // random option order per question
    const body = q.type === "mc"
      ? `<div class="choices gchoices">${G.order.map((k, pos) => `<button class="choice" data-k="${k}"><span class="k">${pos + 1}</span>${esc(q.opts[k])}</button>`).join("")}</div>`
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
      ${fullSentence(q) ? `<div class="sol full"><i>${esc(fullSentence(q))}</i> ${sayBtn(fullSentence(q), "say", "Satz anhören")}</div>` : ""}
      <div class="explain"><div>${esc(q.de)}</div><div class="fa">${esc(q.fa)}</div></div>
      <div style="margin-top:12px"><button class="btn primary" id="gcont">Weiter (Enter)</button></div>`;
    $("#gcont").onclick = nextQuiz;
    $("#gcont").focus();
    updateStats();
  }
  // The complete, correct sentence of a grammar question (for reading aloud).
  function fullSentence(q) {
    const ans = q.type === "mc" ? q.opts[q.a] : q.a[0];
    let t = q.q;
    if (/→/.test(t)) t = t.split("→").pop();                      // transformation tasks: keep the target sentence
    t = noParens(t).trim();                                       // drop hints like "(lernen)"
    if (!/_{3}/.test(t)) {
      // e.g. "Welcher Satz ist richtig?" – the correct option itself is the sentence
      return q.type === "mc" && /\s/.test(ans) && !/[=+]/.test(q.q) ? ans.replace(/^…\s*/, "") : "";
    }
    if (/[=+]/.test(t)) return ans;
    const blanks = t.match(/_{3,}/g).length, parts = String(ans).split(/\s+/);
    if (blanks > 1 && parts.length === blanks) { let k = 0; t = t.replace(/_{3,}/g, () => parts[k++]); }
    else { let first = true; t = t.replace(/_{3,}/g, () => (first ? (first = false, ans) : "")); }
    t = t.replace(/^„|“$/g, "").replace(/…/g, " ").replace(/\s+([,.!?])/g, "$1").replace(/\s+/g, " ").trim();
    return t;
  }
  function nextQuiz() { const G = state.gquiz; G.queue.shift(); G.done = false; G.order = null; renderQuiz(); }
  function renderQuizDone(box) {
    const G = state.gquiz;
    const pct = G.total ? Math.round(100 * G.right / G.total) : 0;
    box.innerHTML = `
      <div class="panel done">
        <div class="lab">Grammatik-Ergebnis · <span class="fa">نتیجه‌ی گرامر</span></div>
        <div class="score">${pct}%</div>
        <div>${G.right} von ${G.total} richtig</div>
        ${G.wrong.length ? `<div class="missed"><div class="lab">Falsch beantwortet · <span class="fa">سؤال‌هایی که اشتباه جواب دادی</span></div>
          ${G.wrong.map(q => `<div class="mrow"><span>${esc(q.q)} ${sayBtn(fullSentence(q))}</span><b>${esc(q.type === "mc" ? q.opts[q.a] : q.a.join(" / "))}</b></div>`).join("")}</div>` : ""}
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
          <div class="mrow"><span><b>${esc(c.w)}</b> ${sayBtn(sayWord(c.w))} <span class="cnt">×${m.w[c.id]}</span></span><span class="fa">${esc(c.fa)}</span>
          <button class="link" data-del-w="${c.id}" title="Entfernen">✕</button></div>`).join("")}</div>`
          : `<div class="empty">Keine offenen Wortfehler. 🎉 <span class="fa">هیچ اشتباهی در لغت‌ها نداری.</span></div>`}
      </section>
      <section class="panel" style="margin-top:12px">
        <div class="mhead"><h3>Grammatik (${qs.length})</h3>
          ${qs.length ? `<div class="mbtns"><button class="btn primary" id="greview">Grammatikfehler wiederholen</button></div>` : ""}
        </div>
        ${qs.length ? `<div class="mlist">${qs.map(q => `
          <div class="mrow"><span>${esc(q.q)} ${sayBtn(fullSentence(q))} <span class="cnt">×${m.g[q.id]}</span></span><b>${esc(q.type === "mc" ? q.opts[q.a] : q.a.join(" / "))}</b>
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
          <div class="col2"><div class="e">${sent(c.de)} ${sayBtn(c.de)}</div><div class="ef fa">${esc(c.fas)}</div>${collHtml(c, true)}</div>
        </div>`;
      });
      $("#lst").innerHTML = count ? html : `<div class="empty">Nichts gefunden.</div>`;
      bindCommon($("#lst"));
    };
    $("#q").oninput = e => draw(e.target.value);
    draw("");
  }


  // =====================================================================
  //  Common expressions (collocations) and clickable sentence words
  // =====================================================================
  function collHtml(c, compact) {
    if (!c.c || !c.c.length) return "";
    return `<div class="row coll${compact ? " compact" : ""}"><div class="lab">Wendungen · <span class="fa">اصطلاحات پرکاربرد</span></div>
      <ul class="colls">${c.c.map(([de, fa]) => `<li><span class="cde">${sent(de)}</span> ${sayBtn(sayText(de))}<span class="cfa fa">${esc(fa)}</span></li>`).join("")}</ul></div>`;
  }
  const TOKRE = /([A-Za-zÄÖÜäöüßéèêàâçñışğ]+(?:-[A-Za-zÄÖÜäöüßéèêàâçñışğ]+)*)/;
  function sent(text) {
    return String(text).split(TOKRE).map((p, i) => (i % 2 ? `<span class="tok">${esc(p)}</span>` : esc(p))).join("");
  }
  const GL = window.GLOSSAR || {};
  let cardIndex = null;
  const baseOf = w => sayWord(w).split(",")[0].replace(/^(der|die|das|sich)\s+/i, "").trim().toLowerCase();
  function getCardIndex() {
    if (cardIndex) return cardIndex;
    cardIndex = new Map();
    for (const L of LESSONS) for (const c of L.cards) { const k = baseOf(c.w); if (k && !cardIndex.has(k)) cardIndex.set(k, c); }
    return cardIndex;
  }
  function lookup(tok) {
    const cap = tok[0].toUpperCase() + tok.slice(1);
    const g = GL[tok] || GL[tok.toLowerCase()] || GL[cap];
    const lemma = g ? g[0] : tok;
    const idx = getCardIndex();
    const card = idx.get(lemma.toLowerCase()) || idx.get(tok.toLowerCase());
    return { lemma, fa: g ? g[1] : "", card };
  }
  let pop = null;
  function showGloss(el) {
    const tok = el.textContent, r = lookup(tok);
    if (!pop) { pop = document.createElement("div"); pop.className = "gloss-pop"; pop.setAttribute("role", "dialog"); document.body.appendChild(pop); }
    const lemmaLine = r.lemma && r.lemma.toLowerCase() !== tok.toLowerCase() ? ` <span class="gl-lemma">→ ${esc(r.lemma)}</span>` : "";
    pop.innerHTML = `<div class="gl-head"><b>${esc(tok)}</b>${lemmaLine} ${sayBtn(r.lemma || tok)}<button class="gl-x" aria-label="Schließen">✕</button></div>
      ${r.fa ? `<div class="fa gl-fa">${esc(r.fa)}</div>` : ""}
      ${r.card ? `<div class="gl-card"><span>${esc(r.card.w)}</span><span class="fa">${esc(r.card.fa)}</span></div>` : ""}
      ${!r.fa && !r.card ? `<div class="gl-none">Keine Übersetzung gefunden · <span class="fa">معنی پیدا نشد</span></div>` : ""}`;
    bindCommon(pop);
    pop.querySelector(".gl-x").onclick = hideGloss;
    document.querySelectorAll(".tok.on").forEach(x => x.classList.remove("on")); el.classList.add("on");
    pop.style.display = "block";
    const b = el.getBoundingClientRect(), pw = Math.min(300, innerWidth - 24);
    pop.style.width = pw + "px";
    let left = b.left + scrollX + b.width / 2 - pw / 2;
    left = Math.max(12 + scrollX, Math.min(left, scrollX + innerWidth - pw - 12));
    pop.style.left = left + "px";
    const h = pop.offsetHeight;
    pop.style.top = (b.bottom + 8 + h > innerHeight ? b.top + scrollY - h - 8 : b.bottom + scrollY + 8) + "px";
  }
  function hideGloss() { if (pop) pop.style.display = "none"; document.querySelectorAll(".tok.on").forEach(x => x.classList.remove("on")); }
  document.addEventListener("click", e => {
    const t = e.target.closest(".tok");
    if (t) { e.stopPropagation(); showGloss(t); return; }
    if (pop && !e.target.closest(".gloss-pop")) hideGloss();
  }, true);

  // =====================================================================
  //  Settings: voice, speed, auto-play
  // =====================================================================
  var settingsOpen = false;
  function initSettings() {
    const btn = document.createElement("button");
    btn.id = "setBtn"; btn.className = "icon-btn"; btn.title = "Stimme & Tempo"; btn.setAttribute("aria-label", "Stimme und Tempo");
    btn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H2v6h4l5 4V5z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M19 5a10 10 0 0 1 0 14"/></svg>`;
    $("#themeBtn").before(btn);
    const sh = document.createElement("div"); sh.id = "settings"; sh.className = "sheet"; sh.hidden = true;
    document.body.appendChild(sh);
    btn.onclick = () => { settingsOpen = !settingsOpen; sh.hidden = !settingsOpen; if (settingsOpen) renderSettings(); };
  }
  const RATES = [0.75, 1, 1.25, 1.5, 2];
  function refreshSettings(progressOnly) {
    if (typeof settingsOpen === "undefined" || !settingsOpen) return;
    const pr = document.getElementById("nProg");
    if (progressOnly && pr) { pr.value = neuralProgress; const t = document.getElementById("nPct"); if (t) t.textContent = Math.round(neuralProgress * 100) + " %"; return; }
    renderSettings();
  }
  function neuralBlock() {
    const st = neuralState;
    const status = st === "ready" ? `<span class="ok-txt">✓ bereit · <span class="fa">آماده</span></span>`
      : st === "loading" ? `<progress id="nProg" max="1" value="${neuralProgress}"></progress> <span id="nPct">${Math.round(neuralProgress * 100)} %</span> <span class="muted">wird geladen … · <span class="fa">در حال بارگیری</span></span>`
      : st === "error" ? `<span class="bad-txt">Konnte nicht geladen werden · <span class="fa">بارگیری نشد</span></span> <span class="muted small">${esc(neuralMsg)}</span>`
      : "";
    return `<div class="lab" style="margin-top:14px">Sätze vorlesen mit · <span class="fa">خواندن جمله‌ها با</span></div>
      <div class="chips">
        <button class="chip ${store.engine !== "neural" ? "on" : ""}" data-engine="system">Gerätestimme · <span class="fa">صدای دستگاه</span></button>
        <button class="chip ${store.engine === "neural" ? "on" : ""}" data-engine="neural">Natürliche KI-Stimme ★ · <span class="fa">صدای طبیعی</span></button>
      </div>
      <p class="muted small">KI-Stimme „Thorsten“ (Piper, freie Lizenz): klingt deutlich natürlicher, läuft direkt im Browser, einmaliger Download ca. 65 MB (WLAN empfohlen), danach auch offline.
        <span class="fa">صدای «Thorsten» با هوش مصنوعی ساخته شده اما بسیار طبیعی‌تر از صدای کامپیوتر است. یک بار حدود ۶۵ مگابایت دانلود می‌شود (با وای‌فای) و بعد بدون اینترنت هم کار می‌کند.</span></p>
      ${status ? `<div class="n-status">${status}</div>` : ""}`;
  }
  function renderSettings() {
    const sh = $("#settings"); if (!sh) return;
    const opts = deVoices.map(v => `<option value="${esc(v.name)}" ${deVoice && v.name === deVoice.name ? "selected" : ""}>${esc(v.name)}${voiceScore(v) >= 6 ? " ★" : ""}</option>`).join("");
    sh.innerHTML = `
      <div class="sheet-head"><b>Stimme & Tempo</b> <span class="fa">صدا و سرعت</span><button class="gl-x" id="setClose" aria-label="Schließen">✕</button></div>
      ${!hasTTS ? `<p class="muted">Dein Browser unterstützt keine Sprachausgabe.</p>` : `
      <label class="toggle"><input type="checkbox" id="humanSay" ${store.human !== false ? "checked" : ""}><span>🎙️ Echte Aufnahmen für einzelne Wörter · <span class="fa">صدای واقعی انسان برای کلمه‌ها</span></span></label>
      <p class="muted small">Aufnahmen von Muttersprachlern aus Wiktionary / Wikimedia Commons (freie Lizenz). Für viele Wörter vorhanden, Nomen ohne Artikel; sonst liest die gewählte Stimme.
        <span class="fa">تلفظ کلمه‌ها با صدای آلمانی‌زبان‌های واقعی (از ویکی‌واژه). برای بیشتر کلمه‌ها هست؛ اسم‌ها بدون آرتیکل خوانده می‌شوند. اگر ضبطی نباشد، صدای انتخاب‌شده می‌خواند.</span></p>
      ${neuralBlock()}
      <label class="lab" for="voiceSel" style="margin-top:14px">Gerätestimme · <span class="fa">صدای دستگاه</span></label>
      <div class="row-flex"><select id="voiceSel">${opts || `<option>Keine deutsche Stimme gefunden</option>`}</select>
        <button class="btn" id="voiceTest">▶ Testen</button></div>
      <p class="muted small">★ = natürliche Stimme. Am natürlichsten klingen: <b>Microsoft Edge</b> („… Online (Natural)“), <b>Chrome</b> („Google Deutsch“), <b>iPhone/Mac</b> (Stimmen mit „Premium/Verbessert“ in den Einstellungen laden).
        <span class="fa">بهترین و روان‌ترین صداها: مرورگر Edge (صداهای Natural)، Chrome (Google Deutsch)، و در آیفون/مک صداهای «Premium/پیشرفته» را از تنظیمات دانلود کنید.</span></p>
      <div class="lab">Tempo · <span class="fa">سرعت</span></div>
      <div class="chips">${RATES.map(r => `<button class="chip ${store.rate === r ? "on" : ""}" data-rate="${r}">${r}×</button>`).join("")}</div>
      <label class="toggle" style="margin-top:12px"><input type="checkbox" id="autoSay" ${store.auto ? "checked" : ""}><span>🔊 Wort automatisch vorlesen · <span class="fa">خواندن خودکار</span></span></label>
      <p class="muted small">Persische Stimme: ${faVoice ? esc(faVoice.name) + " ✓" : "nicht vorhanden – im Hören-Modus wird die Bedeutung nur angezeigt."}</p>`}`;
    $("#setClose").onclick = () => { settingsOpen = false; sh.hidden = true; };
    const vs = $("#voiceSel");
    if (vs) vs.onchange = () => { store.voice = vs.value; persist(); pickVoice(); stopAll(); sysUtter("Hallo! So klinge ich.", "de"); };
    const vt = $("#voiceTest"); if (vt) vt.onclick = () => { stopAll(); sysUtter("Guten Tag! Ich lese dir die Wörter und Sätze vor.", "de"); };
    sh.querySelectorAll("[data-rate]").forEach(b => b.onclick = () => { store.rate = +b.dataset.rate; persist(); renderSettings(); speak("Das ist mein Tempo."); if (state.mode === "listen") syncListenControls(); });
    const au = $("#autoSay"); if (au) au.onchange = () => { store.auto = au.checked; persist(); };
    const hs = $("#humanSay"); if (hs) hs.onchange = () => { store.human = hs.checked; persist(); if (hs.checked) speak("Gesundheit"); };
    sh.querySelectorAll("[data-engine]").forEach(b => b.onclick = async () => {
      store.engine = b.dataset.engine; persist(); renderSettings();
      if (store.engine === "neural") { const m = await loadNeural(true); if (m) { const h = store.human; store.human = false; await utter("Guten Tag! So klingt die natürliche Stimme."); store.human = h; } }
      else speak("Guten Tag! Das ist die Stimme Ihres Geräts.");
    });
  }

  // =====================================================================
  //  Listening mode: play all words one after another (1×, 1.5×, 2× …)
  // =====================================================================
  state.play = { i: 0, playing: false, token: 0 };
  function stopPlay() {
    if (!state.play) return;
    state.play.playing = false; state.play.token++;
    stopAll();
  }
  function togglePlay() {
    if (state.play.playing) { stopPlay(); syncListenControls(); return; }
    if (state.play.i >= state.deck.length) state.play.i = 0;
    state.play.playing = true; const tok = ++state.play.token;
    syncListenControls(); playLoop(tok);
  }
  async function playLoop(tok) {
    const alive = () => state.play.playing && tok === state.play.token && state.mode === "listen";
    const gap = ms => wait(ms / store.rate);
    while (alive() && state.play.i < state.deck.length) {
      const c = state.deck[state.play.i];
      showListenCard();
      await utter(sayWord(c.w)); if (!alive()) return;
      await gap(500);
      if (store.play.fa && faVoice) { await utter(c.fa, "fa"); if (!alive()) return; await gap(400); }
      if (store.play.ex) { await utter(c.de); if (!alive()) return; await gap(600); }
      if (store.play.coll && c.c) { for (const [d] of c.c) { await utter(sayText(d)); if (!alive()) return; await gap(300); } }
      await gap(500);
      if (!alive()) return;
      state.play.i++;
    }
    if (tok === state.play.token) { state.play.playing = false; if (state.mode === "listen") { if (state.play.i >= state.deck.length) state.play.i = Math.max(0, state.deck.length - 1); syncListenControls(); } }
  }
  function renderListen() {
    const d = state.deck;
    if (!d.length) { app.innerHTML = emptyMsg(); return; }
    if (state.play.i >= d.length) state.play.i = 0;
    app.innerHTML = `
      <div class="panel listen">
        <div id="lsProg"></div>
        <div id="lsCard" class="ls-card"></div>
        <div class="ls-ctrl">
          <button class="nav" id="lsPrev" aria-label="Zurück">⏮</button>
          <button class="btn primary ls-play" id="lsPlay"></button>
          <button class="nav" id="lsNext" aria-label="Weiter">⏭</button>
        </div>
        <div class="ls-opts">
          <div class="chips" id="lsRates">${RATES.map(r => `<button class="chip" data-rate="${r}">${r}×</button>`).join("")}</div>
          <label class="toggle"><input type="checkbox" id="lsEx" ${store.play.ex ? "checked" : ""}><span>Beispielsatz · <span class="fa">جمله</span></span></label>
          <label class="toggle"><input type="checkbox" id="lsColl" ${store.play.coll ? "checked" : ""}><span>Wendungen · <span class="fa">اصطلاحات</span></span></label>
          <label class="toggle" ${faVoice ? "" : `title="Keine persische Stimme auf diesem Gerät"`}><input type="checkbox" id="lsFa" ${store.play.fa ? "checked" : ""} ${faVoice ? "" : "disabled"}><span>Persisch vorlesen · <span class="fa">خواندن معنی فارسی</span></span></label>
        </div>
        <p class="muted small">Leertaste = Start/Pause · Die Liste folgt den Filtern oben (Abschnitte, markiert, ungelernt).
          <span class="fa">همه‌ی کلمه‌های این درس پشت سر هم پخش می‌شوند؛ سرعت را با دکمه‌های ×۱ تا ×۲ عوض کنید.</span></p>
      </div>`;
    $("#lsPlay").onclick = togglePlay;
    $("#lsPrev").onclick = () => { const was = state.play.playing; stopPlay(); state.play.i = Math.max(0, state.play.i - 1); showListenCard(); if (was) togglePlay(); else syncListenControls(); };
    $("#lsNext").onclick = () => { const was = state.play.playing; stopPlay(); state.play.i = Math.min(d.length - 1, state.play.i + 1); showListenCard(); if (was) togglePlay(); else syncListenControls(); };
    app.querySelectorAll("#lsRates [data-rate]").forEach(b => b.onclick = () => { store.rate = +b.dataset.rate; persist(); syncListenControls(); });
    const bindOpt = (id, key) => { $(id).onchange = e => { store.play[key] = e.target.checked; persist(); }; };
    bindOpt("#lsEx", "ex"); bindOpt("#lsColl", "coll"); bindOpt("#lsFa", "fa");
    showListenCard(); syncListenControls();
  }
  function showListenCard() {
    const box = $("#lsCard"); if (!box) return;
    const d = state.deck, c = d[state.play.i]; if (!c) return;
    prefetchHuman(d.slice(state.play.i, state.play.i + 3).map(x => sayWord(x.w)));
    box.innerHTML = `<div class="ls-word">${esc(c.w)} ${sayBtn(sayWord(c.w))}</div>
      <div class="fa ls-fa">${esc(c.fa)}</div>
      <div class="ex">${sent(c.de)} ${sayBtn(c.de)}</div><div class="exfa fa">${esc(c.fas)}</div>
      ${collHtml(c, true)}`;
    bindCommon(box);
    const pr = $("#lsProg"); if (pr) pr.innerHTML = progressBar(state.play.i + 1, d.length);
  }
  function syncListenControls() {
    const b = $("#lsPlay"); if (!b) return;
    b.innerHTML = state.play.playing ? "⏸ Pause" : "▶ Alle abspielen";
    app.querySelectorAll("#lsRates [data-rate]").forEach(x => x.classList.toggle("on", +x.dataset.rate === store.rate));
  }

  // =====================================================================
  //  Article search (der / die / das) and article quiz
  // =====================================================================
  function umlaut(n) {
    return n.replace(/(au|a|o|u)([^aeiouäöü]*(?:e[^aeiouäöü]*)?)$/i, (m, v, rest) => ({ au: "äu", a: "ä", o: "ö", u: "ü", Au: "Äu", A: "Ä", O: "Ö", U: "Ü" }[v] || v) + rest);
  }
  function parseNoun(w) {
    const m = w.match(/^((?:der|die|das)(?:\s*\/\s*(?:der|die|das))?)\s+(.+)$/);
    if (!m) return null;
    const arts = m[1].split("/").map(a => a.trim());
    let rest = m[2];
    const note = (rest.match(/\(.*?\)/g) || []).join(" ");
    rest = rest.replace(/\(.*?\)/g, " ").split(/\s+[\/≠]\s+/)[0].trim();
    let [noun, mark] = rest.split(/\s*,\s*/);
    noun = (noun || "").trim(); mark = (mark || "").trim();
    let plural = "";
    if (/nur\s*Pl/i.test(note)) plural = noun;
    else if (/nur\s*Sg/i.test(note) && !mark) plural = "";
    else if (mark === "-") plural = noun;
    else if (/^¨/.test(mark)) plural = umlaut(noun) + mark.replace(/^¨-?/, "");
    else if (/^-/.test(mark)) plural = noun + mark.slice(1).split("/")[0];
    else if (mark) plural = mark.split("/")[0].trim();
    return { arts, noun, plural, note: note.replace(/[()]/g, ""), mark };
  }
  let nounList = null;
  function getNouns() {
    if (nounList) return nounList;
    const seen = new Set(); nounList = [];
    for (const L of LESSONS) for (const c of L.cards) {
      const p = parseNoun(c.w); if (!p || !p.noun) continue;
      const k = p.arts.join("/") + " " + p.noun; if (seen.has(k)) continue; seen.add(k);
      nounList.push({ ...p, c, set: L.title });
    }
    nounList.sort((a, b) => a.noun.localeCompare(b.noun, "de"));
    return nounList;
  }
  state.art = { q: "", f: "", limit: 150, quiz: null };
  const artTag = a => `<span class="art art-${a}">${a}</span>`;
  function renderArtikel() {
    const A = state.art, all = getNouns();
    if (A.quiz) return renderArtQuiz();
    const counts = { der: 0, die: 0, das: 0 }; all.forEach(n => n.arts.forEach(a => counts[a]++));
    app.innerHTML = `
      <div class="panel">
        <h2 class="mtitle">Artikel suchen <span class="fa">جستجوی آرتیکل</span></h2>
        <input class="search" id="artQ" placeholder="Nomen eingeben … z. B. Vorschlag / معنی فارسی" value="${esc(A.q)}" aria-label="Nomen suchen">
        <div class="chips">
          <button class="chip ${A.f ? "" : "on"}" data-f="">Alle (${all.length})</button>
          <button class="chip ${A.f === "der" ? "on" : ""}" data-f="der">${artTag("der")} ${counts.der}</button>
          <button class="chip ${A.f === "die" ? "on" : ""}" data-f="die">${artTag("die")} ${counts.die}</button>
          <button class="chip ${A.f === "das" ? "on" : ""}" data-f="das">${artTag("das")} ${counts.das}</button>
          <button class="btn primary" id="artQuiz" style="margin-left:auto">Artikel üben · <span class="fa">تمرین آرتیکل</span></button>
        </div>
      </div>
      <div class="list" id="artList" style="margin-top:12px"></div>`;
    const draw = () => {
      const q = A.q.trim().toLowerCase();
      const res = all.filter(n => (!A.f || n.arts.includes(A.f)) && (!q || n.noun.toLowerCase().includes(q) || n.c.fa.includes(A.q.trim())));
      const exact = q ? res.filter(n => n.noun.toLowerCase() === q) : [];
      const list = exact.concat(res.filter(n => !exact.includes(n)));
      $("#artList").innerHTML = list.length ? list.slice(0, A.limit).map(n => `
        <div class="art-row">
          <div class="art-main">${n.arts.map(artTag).join("/")} <b>${esc(n.noun)}</b> ${sayBtn(n.arts[0] + " " + n.noun)}</div>
          <div class="art-pl">${n.plural ? `Plural: ${artTag("die")} ${esc(n.plural)}` : `<span class="muted">kein Plural</span>`}${n.note ? ` <span class="muted">(${esc(n.note)})</span>` : ""}</div>
          <div class="fa art-fa">${esc(n.c.fa)}</div>
        </div>`).join("") + (list.length > A.limit ? `<div class="empty"><button class="btn" id="artMore">Mehr anzeigen (${list.length - A.limit})</button></div>` : "")
        : `<div class="empty">Kein Nomen gefunden · <span class="fa">پیدا نشد</span></div>`;
      bindCommon($("#artList"));
      const more = $("#artMore"); if (more) more.onclick = () => { A.limit += 300; draw(); };
    };
    const qi = $("#artQ"); qi.oninput = () => { A.q = qi.value; A.limit = 150; draw(); };
    app.querySelectorAll("[data-f]").forEach(b => b.onclick = () => { A.f = b.dataset.f; renderArtikel(); });
    $("#artQuiz").onclick = () => { A.quiz = { n: 0, right: 0, streak: 0, cur: null, done: false }; renderArtikel(); };
    draw();
  }
  function renderArtQuiz() {
    const Q = state.art.quiz, all = getNouns().filter(n => n.arts.length === 1 || true);
    if (!Q.cur) Q.cur = all[Math.floor(Math.random() * all.length)];
    const n = Q.cur;
    app.innerHTML = `
      <div class="panel">
        <div class="mhead"><h2 class="mtitle" style="margin:0">Artikel üben <span class="fa">تمرین آرتیکل</span></h2>
          <span class="tally"><span class="g">✓ ${Q.right}</span> / ${Q.n} · 🔥 ${Q.streak}</span></div>
        <div class="q"><div class="big">___ ${esc(n.noun)}</div><div class="fa" style="margin-top:6px">${esc(n.c.fa)}</div></div>
        <div class="art-btns">${["der", "die", "das"].map(a => `<button class="choice art-choice art-${a}" data-a="${a}">${a}</button>`).join("")}</div>
        <div class="feedback" id="aqFb"></div>
        <div class="subctrl"><button class="link" id="aqBack">Zurück zur Suche</button></div>
      </div>`;
    app.querySelectorAll("[data-a]").forEach(b => b.onclick = () => {
      if (Q.done) return; Q.done = true; Q.n++;
      const ok = n.arts.includes(b.dataset.a);
      if (ok) { Q.right++; Q.streak++; } else Q.streak = 0;
      app.querySelectorAll("[data-a]").forEach(x => { x.disabled = true; if (n.arts.includes(x.dataset.a)) x.classList.add("right"); else if (x === b) x.classList.add("wrong"); });
      $("#aqFb").innerHTML = `<span class="${ok ? "ok" : "no"}">${ok ? "Richtig!" : "Falsch."}</span> ${n.arts.map(artTag).join("/")} <b>${esc(n.noun)}</b>${n.plural ? ` · Pl. die ${esc(n.plural)}` : ""} ${sayBtn(n.arts[0] + " " + n.noun)}
        <div style="margin-top:10px"><button class="btn primary" id="aqNext">Weiter (Enter)</button></div>`;
      bindCommon($("#aqFb"));
      if (store.auto) speak(n.arts[0] + " " + n.noun);
      $("#aqNext").onclick = () => { Q.cur = null; Q.done = false; renderArtQuiz(); };
      $("#aqNext").focus();
    });
    $("#aqBack").onclick = () => { state.art.quiz = null; renderArtikel(); };
  }

  // =====================================================================
  //  Verbs: conjugation tables for every verb of this level
  // =====================================================================
  state.verb = { q: "", sel: null };
  let verbList = null;
  function getVerbs() {
    if (verbList) return verbList;
    const VB = window.VERBEN || [];
    const byInf = new Map(); VB.forEach(v => { const k = v.inf; if (!byInf.has(k)) byInf.set(k, []); byInf.get(k).push(v); });
    const pageInf = new Map();
    for (const L of LESSONS) for (const c of L.cards) {
      for (const part of sayWord(c.w).split(",")) {
        const refl = /^sich\s/.test(part.trim());
        const words = part.trim().replace(/^sich\s+/, "").split(/\s+/);
        for (const w of [words[0], words[words.length - 1]]) {
          if (!w || !byInf.has(w)) continue;
          const cands = byInf.get(w);
          const v = cands.find(x => !!x.refl === refl) || cands[0];
          if (!pageInf.has(v.inf + "|" + (v.refl || ""))) pageInf.set(v.inf + "|" + (v.refl || ""), { v, c });
        }
      }
    }
    verbList = [...pageInf.values()].sort((a, b) => a.v.inf.localeCompare(b.v.inf, "de"));
    return verbList;
  }
  const verbLabel = v => (v.refl ? "sich " : "") + v.inf;
  function renderVerben() {
    const V = state.verb, all = getVerbs();
    if (!window.Konjugation || !all.length) { app.innerHTML = `<div class="panel empty">Für diese Stufe gibt es noch keine Verbtabellen.</div>`; return; }
    if (V.sel) return renderVerb(V.sel);
    app.innerHTML = `
      <div class="panel">
        <h2 class="mtitle">Verben konjugieren <span class="fa">صرف فعل‌ها در همه‌ی زمان‌ها</span></h2>
        <input class="search" id="vbQ" placeholder="Verb suchen … z. B. anfangen / معنی فارسی" value="${esc(V.q)}" aria-label="Verb suchen">
        <p class="muted small">${all.length} Verben · Präsens, Präteritum, Perfekt, Plusquamperfekt, Futur I/II, Konjunktiv I/II, Imperativ</p>
      </div>
      <div class="list" id="vbList" style="margin-top:12px"></div>`;
    const draw = () => {
      const q = V.q.trim().toLowerCase();
      const res = all.filter(({ v, c }) => !q || verbLabel(v).toLowerCase().includes(q) || (v.fa || "").includes(V.q.trim()) || (c.fa || "").includes(V.q.trim()));
      $("#vbList").innerHTML = res.length ? res.slice(0, 400).map(({ v, c }, i) => {
        const k = Konjugation.conjugate(v);
        return `<button class="vb-row" data-i="${all.indexOf(res[i])}"><b>${esc(verbLabel(v))}</b><span class="muted">${esc(k.summary.split(" – ").slice(1).join(" – "))}</span><span class="fa">${esc(v.fa || c.fa)}</span></button>`;
      }).join("") : `<div class="empty">Kein Verb gefunden · <span class="fa">پیدا نشد</span></div>`;
      $("#vbList").querySelectorAll("[data-i]").forEach(b => b.onclick = () => { V.sel = all[+b.dataset.i]; renderVerben(); window.scrollTo({ top: 0 }); });
    };
    const qi = $("#vbQ"); qi.oninput = () => { V.q = qi.value; draw(); };
    draw();
  }
  function renderVerb({ v, c }) {
    const k = Konjugation.conjugate(v);
    const spoken = (pron, form) => (pron.split("/")[0] + " " + form).replace(/!$/, "");
    app.innerHTML = `
      <div class="panel">
        <button class="link" id="vbBack">← Alle Verben</button>
        <div class="gtitle" style="margin-top:6px"><h2>${esc(verbLabel(v))} ${sayBtn(verbLabel(v))}</h2><span class="fa">${esc(v.fa || c.fa)}</span></div>
        <p class="vb-sum">${esc(k.summary)} ${sayBtn(k.summary.replace(/ – /g, ", "))}</p>
        ${c && c.de ? `<div class="ex">${sent(c.de)} ${sayBtn(c.de)}</div><div class="exfa fa">${esc(c.fas)}</div>` : ""}
      </div>
      <div class="vb-grid">${k.tenses.map(t => `
        <section class="panel vb-t">
          <h3>${esc(t.name)} <span class="fa">${esc(t.fa)}</span></h3>
          ${t.alt ? `<div class="muted small">${esc(t.alt)}</div>` : ""}
          <table>${t.rows.map(([p, f]) => `<tr><td class="vb-p">${esc(p)}</td><td>${esc(f)}</td><td>${sayBtn(t.id === "imp" ? f.replace(/!$/, "") : spoken(p, f))}</td></tr>`).join("")}</table>
        </section>`).join("")}</div>`;
    bindCommon(app);
    $("#vbBack").onclick = () => { state.verb.sel = null; renderVerben(); };
  }

  // =====================================================================
  //  5 useful sentences a day
  // =====================================================================
  state.day = { off: 0, showFa: true };
  function renderDaily() {
    const TG = window.TAEGLICH || [];
    if (!TG.length) { app.innerHTML = `<div class="panel empty">Die Tagessätze gibt es auf der B2-Seite.<br><span class="fa">جمله‌های روزانه در بخش B2 هستند.</span></div>`; return; }
    const today = Math.floor((Date.now() - new Date().getTimezoneOffset() * 6e4) / 864e5);
    const idx = (((today + state.day.off) % TG.length) + TG.length) % TG.length;
    const D = TG[idx];
    const date = new Date((today + state.day.off) * 864e5);
    const ds = date.toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
    const done = !!store.dailyDone[D.day];
    app.innerHTML = `
      <div class="panel daily">
        <div class="mhead">
          <button class="nav" id="dPrev" aria-label="Vorheriger Tag">◀</button>
          <div class="d-head"><div class="muted small">${state.day.off === 0 ? "Heute" : esc(ds)} · Tag ${D.day} von ${TG.length}</div>
            <h2 class="mtitle" style="margin:2px 0 0">${esc(D.theme)}</h2><div class="fa">${esc(D.theme_fa)}</div></div>
          <button class="nav" id="dNext" aria-label="Nächster Tag">▶</button>
        </div>
        <div class="d-tools">
          <button class="btn primary" id="dAll">▶ Alle 5 anhören</button>
          <label class="toggle"><input type="checkbox" id="dFa" ${state.day.showFa ? "checked" : ""}><span>Übersetzung zeigen · <span class="fa">ترجمه</span></span></label>
          <button class="btn ${done ? "good" : ""}" id="dDone">${done ? "✓ Gelernt" : "Als gelernt markieren"}</button>
        </div>
        <ol class="d-list">${D.s.map((x, i) => `
          <li><div class="d-de">${sent(x.de)} ${sayBtn(x.de)}</div>
            ${state.day.showFa ? `<div class="fa d-fa">${esc(x.fa)}</div>` : `<button class="link d-reveal" data-i="${i}">Übersetzung zeigen</button><div class="fa d-fa" hidden>${esc(x.fa)}</div>`}
            ${x.note ? `<div class="fa d-note">💡 ${esc(x.note)}</div>` : ""}</li>`).join("")}</ol>
        <p class="muted small">Jeden Tag kommen 5 neue Sätze. Tipp: Satz anhören, laut nachsprechen, dann ohne Übersetzung wiederholen.
          <span class="fa">هر روز ۵ جمله‌ی تازه؛ بشنوید، بلند تکرار کنید، بعد بدون ترجمه مرور کنید. روی هر کلمه بزنید تا معنی‌اش بیاید.</span></p>
      </div>`;
    bindCommon(app);
    $("#dPrev").onclick = () => { state.day.off--; renderDaily(); };
    $("#dNext").onclick = () => { state.day.off++; renderDaily(); };
    $("#dFa").onchange = e => { state.day.showFa = e.target.checked; renderDaily(); };
    app.querySelectorAll(".d-reveal").forEach(b => b.onclick = () => { b.nextElementSibling.hidden = false; b.remove(); });
    $("#dDone").onclick = () => { store.dailyDone[D.day] = !done; persist(); renderDaily(); };
    $("#dAll").onclick = async () => {
      const tok = ++state.play.token;
      for (const x of D.s) { if (tok !== state.play.token || state.mode !== "daily") return; await utter(x.de); await wait(700 / store.rate); }
    };
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
    if (state.mode === "listen" && e.key === " ") { e.preventDefault(); togglePlay(); return; }
    if (state.mode === "cards" && state.i < state.deck.length) {
      const c = state.deck[state.i];
      if (e.key === " " || e.key === "ArrowUp" || e.key === "ArrowDown") { e.preventDefault(); flip(); }
      else if (e.key === "ArrowRight") go(1);
      else if (e.key === "ArrowLeft") go(-1);
      else if (e.key === "1") judge(false);
      else if (e.key === "2") judge(true);
      else if (e.key.toLowerCase() === "s") { const b = $(`[data-star="${c.id}"]`); if (b) b.click(); }
      else if (e.key.toLowerCase() === "a") speak(sayWord(c.w));
      else if (e.key.toLowerCase() === "b") speak(c.de);
    } else if (state.mode === "learn" && state.learn) {
      if (/^[1-4]$/.test(e.key) && !state.learn.answered) { const b = app.querySelectorAll(".choice")[+e.key - 1]; if (b) b.click(); }
    } else if (state.mode === "grammar" && state.gview === "quiz" && state.gquiz && !state.gquiz.done) {
      if (/^[1-4]$/.test(e.key)) { const b = app.querySelectorAll(".gchoices .choice")[+e.key - 1]; if (b) b.click(); }
    }
  });

  window.KompassDebug = { fullSentence, sayWord };   // used by automated tests
  if (!LESSONS.length) { app.innerHTML = `<div class="panel empty">Die Inhalte werden gerade erstellt – bitte später noch einmal vorbeischauen.<br><span class="fa">محتوای این بخش در حال آماده‌سازی است.</span></div>`; return; }
  initChrome();
  restart();
})();
