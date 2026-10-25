/* German conjugation engine: builds all tenses from a verb's principal parts.
   Input verb object: { inf, sep, refl: null|"akk"|"dat", prs2, prs3, prt, pp, aux, k2, imp, special, fa } */
(function (root) {
  "use strict";
  const PRON = ["ich", "du", "er/sie/es", "wir", "ihr", "sie/Sie"];
  const REFL = { akk: ["mich", "dich", "sich", "uns", "euch", "sich"], dat: ["mir", "dir", "sich", "uns", "euch", "sich"] };
  const TABLE = {
    sein:   { prs: ["bin", "bist", "ist", "sind", "seid", "sind"], prt: "war", k1: ["sei", "seist", "sei", "seien", "seiet", "seien"], k2: ["wäre", "wärst", "wäre", "wären", "wärt", "wären"], imp: ["sei", "seid", "seien Sie"] },
    haben:  { prs: ["habe", "hast", "hat", "haben", "habt", "haben"], prt: "hatte", k2: ["hätte", "hättest", "hätte", "hätten", "hättet", "hätten"], imp: ["hab", "habt", "haben Sie"] },
    werden: { prs: ["werde", "wirst", "wird", "werden", "werdet", "werden"], prt: "wurde", k2: ["würde", "würdest", "würde", "würden", "würdet", "würden"], imp: ["werde", "werdet", "werden Sie"] },
    wissen: { prs: ["weiß", "weißt", "weiß", "wissen", "wisst", "wissen"], prt: "wusste", k2: ["wüsste", "wüsstest", "wüsste", "wüssten", "wüsstet", "wüssten"], imp: ["wisse", "wisst", "wissen Sie"] },
    tun:    { prs: ["tue", "tust", "tut", "tun", "tut", "tun"], prt: "tat", k2: ["täte", "tätest", "täte", "täten", "tätet", "täten"], imp: ["tu", "tut", "tun Sie"] },
    dürfen: { prs: ["darf", "darfst", "darf", "dürfen", "dürft", "dürfen"], prt: "durfte", k2s: "dürfte", modal: true },
    können: { prs: ["kann", "kannst", "kann", "können", "könnt", "können"], prt: "konnte", k2s: "könnte", modal: true },
    mögen:  { prs: ["mag", "magst", "mag", "mögen", "mögt", "mögen"], prt: "mochte", k2s: "möchte", modal: true },
    müssen: { prs: ["muss", "musst", "muss", "müssen", "müsst", "müssen"], prt: "musste", k2s: "müsste", modal: true },
    sollen: { prs: ["soll", "sollst", "soll", "sollen", "sollt", "sollen"], prt: "sollte", k2s: "sollte", modal: true },
    wollen: { prs: ["will", "willst", "will", "wollen", "wollt", "wollen"], prt: "wollte", k2s: "wollte", modal: true },
    möchten: { prs: ["möchte", "möchtest", "möchte", "möchten", "möchtet", "möchten"], prt: "wollte", k2s: "möchte", modal: true },
  };
  const AUXPRS = { haben: TABLE.haben.prs, sein: TABLE.sein.prs };
  const AUXPRT = { haben: weakPrt("hatte"), sein: strongPrt("war") };
  const AUXK2 = { haben: TABLE.haben.k2, sein: TABLE.sein.k2 };
  const WERDEN = TABLE.werden.prs, WUERDE = TABLE.werden.k2;

  function needsE(stem) { return /[dt]$/.test(stem) || /[^lrhmnaeiouäöüy][mn]$/.test(stem); }
  function weakPrt(p) { return [p, p + "st", p, p + "n", p + "t", p + "n"]; }
  function strongPrt(p) {
    const e = /[sßzxdt]$/.test(p) ? "est" : "st";
    const t = /[dt]$/.test(p) ? "et" : "t";
    return [p, p + e, p, p + "en", p + t, p + "en"];
  }
  function finite(form, sep) {               // "fängt an" -> "fängt"
    form = (form || "").trim();
    if (sep && form.endsWith(" " + sep)) return form.slice(0, -sep.length - 1).trim();
    return form.split(/\s+/)[0];
  }

  function conjugate(v) {
    const sep = (v.sep || "").trim();
    const base = sep && v.inf.startsWith(sep) ? v.inf.slice(sep.length) : v.inf;
    const special = TABLE[base] ? base : null;
    const T = special ? TABLE[special] : null;
    const refl = v.refl ? REFL[v.refl] : null;
    const auxes = (v.aux || "haben").split("/").map(s => s.trim()).filter(a => a === "haben" || a === "sein");
    if (auxes.length > 1 && auxes.includes("sein")) auxes.sort((a, b) => (a === "sein" ? -1 : 1));  // motion verbs: "sein" first
    const aux = auxes[0] || "haben";
    const pp = (v.pp || "").trim();
    const P = sep ? " " + sep : "";

    // --- Präsens (finite forms without particle)
    let prs;
    if (T) prs = T.prs.slice();
    else {
      const inf = base;
      const elnErn = /[^aeiouäöü](el|er)n$/.test(inf) || /^(el|er)n$/.test(inf);
      const stem = elnErn ? inf.slice(0, -1) : inf.replace(/e?n$/, "");
      const regEr = stem + (needsE(stem) ? "et" : "t");
      const du = finite(v.prs2, sep) || stem + (needsE(stem) ? "est" : /[sßzx]$/.test(stem) ? "t" : "st");
      const er = finite(v.prs3, sep) || regEr;
      const ich = elnErn && /el$/.test(stem) ? stem.slice(0, -2) + "le" : stem + "e";
      const ihr = elnErn ? stem + "t" : (er === regEr ? er : regEr);
      prs = [ich, du, er, inf, ihr, inf];
    }
    // --- Präteritum
    const prt3 = T ? T.prt : finite(v.prt, sep);
    const prt = /e$/.test(prt3) ? weakPrt(prt3) : strongPrt(prt3);
    // --- Konjunktiv II (synthetic form, only when it is common)
    let k2 = null;
    if (T && T.k2) k2 = T.k2.slice();
    else if (T && T.k2s) k2 = weakPrt(T.k2s);
    else if (v.k2) { const k = finite(v.k2, sep); k2 = /e$/.test(k) ? weakPrt(k) : strongPrt(k); }
    // --- Konjunktiv I
    let k1;
    if (special === "sein") k1 = T.k1.slice();
    else {
      const eln = /[^aeiouäöü](el|er)n$/.test(base);
      const s1 = special === "möchten" ? "möcht" : eln ? base.slice(0, -1) : base.replace(/e?n$/, "");
      k1 = eln ? [prs[0], s1 + "st", prs[0], base, s1 + "t", base]
               : [s1 + "e", s1 + "est", s1 + "e", base, s1 + "et", base];
    }

    const row = (i, parts) => [PRON[i], parts.filter(Boolean).join(" ").replace(/\s+/g, " ").trim()];
    const r = i => (refl ? refl[i] : "");
    const simple = forms => forms.map((f, i) => row(i, [f, r(i), sep]));
    const compound = (auxForms, tail) => auxForms.map((a, i) => row(i, [a, r(i), tail]));

    const tenses = [];
    tenses.push({ id: "prs", name: "Präsens", fa: "زمان حال", rows: simple(prs) });
    tenses.push({ id: "prt", name: "Präteritum", fa: "گذشته‌ی ساده", rows: simple(prt) });
    tenses.push({ id: "perf", name: "Perfekt", fa: "گذشته‌ی نقلی (گفتاری)", rows: compound(AUXPRS[aux], pp), alt: auxes[1] ? `auch mit „${auxes[1]}“` : "" });
    tenses.push({ id: "plq", name: "Plusquamperfekt", fa: "گذشته‌ی بعید", rows: compound(AUXPRT[aux], pp) });
    tenses.push({ id: "fut1", name: "Futur I", fa: "آینده", rows: compound(WERDEN, v.inf) });
    tenses.push({ id: "fut2", name: "Futur II", fa: "آینده‌ی کامل", rows: compound(WERDEN, pp + " " + aux) });
    if (k2) tenses.push({ id: "k2", name: "Konjunktiv II", fa: "وجه التزامی ۲ (شکل اصلی)", rows: simple(k2) });
    tenses.push({ id: "k2w", name: "Konjunktiv II (würde-Form)", fa: "وجه التزامی ۲ با würde", rows: compound(WUERDE, v.inf) });
    tenses.push({ id: "k2v", name: "Konjunktiv II Vergangenheit", fa: "وجه التزامی ۲ گذشته", rows: compound(AUXK2[aux], pp) });
    tenses.push({ id: "k1", name: "Konjunktiv I (indirekte Rede)", fa: "وجه التزامی ۱ (نقل قول غیرمستقیم)", rows: simple(k1) });

    // --- Imperativ (du, ihr, Sie)
    if (!T || !T.modal) {
      let du, ihr, sie;
      if (T && T.imp) [du, ihr, sie] = T.imp;
      else {
        const isEln = /[^aeiouäöü](el|er)n$/.test(base);
        du = v.imp ? finite(v.imp, sep) : isEln ? prs[0] : (needsE(prs[0].slice(0, -1)) ? prs[0] : prs[0].replace(/e$/, ""));
        ihr = prs[4]; sie = base + " Sie";
      }
      const rr = refl || ["", "dich", "", "", "euch", "sich"];
      const imp = [
        ["du", [du, refl ? rr[1] : "", sep].filter(Boolean).join(" ") + "!"],
        ["ihr", [ihr, refl ? rr[4] : "", sep].filter(Boolean).join(" ") + "!"],
        ["Sie", [sie, refl ? "sich" : "", sep].filter(Boolean).join(" ") + "!"],
      ];
      tenses.push({ id: "imp", name: "Imperativ", fa: "امری", rows: imp });
    }
    const summary = [v.inf, finite(v.prs3, sep) ? (T ? T.prs[2] : finite(v.prs3, sep)) + P : (T ? T.prs[2] + P : prs[2] + P),
      prt3 + P, (aux === "sein" ? "ist " : "hat ") + pp].join(" – ");
    return { summary, tenses, special: special || null };
  }

  const api = { conjugate, PRON };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.Konjugation = api;
})(typeof window !== "undefined" ? window : this);
