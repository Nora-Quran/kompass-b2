# Kompass DaF B2 · Karteikarten

Quizlet-style flashcards, grammar explanations and a mistakes trainer for **Kompass DaF B2** (Klett). Every word has a German synonym, an example sentence and a Persian (فارسی) translation. Grammar is explained in German and Persian.

**Current content:** Lektion 1, which has:
- 134 words from the official lesson word list (sections A–D)
- 40 extra words from the listening texts and the lesson test (section E)
- 2 grammar topics: *Gründe ausdrücken* and *Alternativen nennen*
- 22 grammar exercises

Lektionen 2–10 can be added as extra data files.

## Modes

| Mode | What it does |
|---|---|
| **Karteikarten** | Flip cards (click / Space), sort them into ✓ *Gewusst* / ✗ *Noch nicht* (buttons, keys `1`/`2`, or swipe on a phone), then repeat only the missed cards. |
| **Lernen** | Multiple choice with 4 options. Wrong answers come back later in the round. |
| **Schreiben** | See the Persian meaning and type the German word. Articles and *sich* are optional, small typos are recognised, and "Ich hatte recht" overrides. |
| **Grammatik** | Explanation of each grammar topic in German and Persian, with examples and an overview table, plus exercises (multiple choice and gap fill) with explanations. |
| **Fehler** | Every word or grammar question you got wrong, per lesson, with a count. You can practise them again (Lernen / Karteikarten / Schreiben / Grammatik), and each one is removed once you answer it correctly. |
| **Liste** | Full word list with search and star marks. |

Other features:
- Front side can be **Deutsch** or **Persisch**.
- Filter by section (A–D), by starred cards or by unlearned cards.
- German read-aloud (🔊, key `A`).
- Dark mode.
- Progress is saved in the browser.

## Run

It is a static site with no build step: open `index.html`, or serve the folder with GitHub Pages.

## Adding a lesson

1. Create `data/lektionN.js` in the same format as `data/lektion1.js`. It calls `(window.LESSONS = window.LESSONS || []).push({...})`.
2. Add `<script src="data/lektionN.js"></script>` to `index.html` before `app.js`.

The lesson object can also contain `grammar` (topics) and `quiz` (questions). See `data/lektion1.js`.

Card fields:
- `id`: unique, e.g. `L2-15`
- `s`: section letter
- `w`: German word with article and plural
- `fa`: Persian meaning
- `syn`: synonyms
- `de`: example sentence
- `fas`: Persian translation of the sentence

## Sources

The word selection follows the publisher's free *Lektionswortschatz* lists for Kompass DaF B2 (Ernst Klett Sprachen). Extra words (section E) come from the free transcripts and lesson test. The grammar topics follow the official Lektionstest 1. The synonyms, example sentences, translations, explanations and exercises are original.
