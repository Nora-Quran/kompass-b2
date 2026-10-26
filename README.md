# Deutsch A1 · A2 · B2 · Karteikarten

Quizlet-style flashcards, grammar explanations and a mistakes trainer for **Kompass DaF B2** (Klett). Every word has a German synonym, an example sentence and a Persian (فارسی) translation. Grammar is explained in German and Persian.

**Levels (switch in the header):**
- **B2** (start page `/`): Kompass DaF B2, Lektion 1–10, plus extra B1/B2 vocabulary.
- **A1** (`/A1/`): 10 thematic units, 810 cards, 20 grammar topics, 214 exercises.
- **A2** (`/A2/`): 10 thematic units, 687 cards, 20 grammar topics, 214 exercises.
- **B1** (`/B1/`): 10 thematic units, 1,586 cards (the whole Goethe-Zertifikat B1 word list without the A2 words), 20 grammar topics, 284 exercises.

The A1/A2 words come from the official Goethe-Zertifikat A2 word list, which contains the whole basic vocabulary. It is split into A1 and A2 by the Start Deutsch 1 level. Progress is saved separately for each level.

**B2 content:**
- **Lektion 1–10** (the whole book): 3,234 cards. That is 1,772 cards from the official lesson word lists, the listening texts and the lesson tests, plus a new section **F · Themenwortschatz** in every lesson with 60–70 related words that are not in the book (666 in total). Lektion 1–5 also have a section **T · Wörter aus den Buchtexten** (796 words from the course and exercise book texts of Kompass DaF B2.1), and their grammar follows the book's grammar topics exactly (Lektionsgrammatik and Grammatik zum Nachschlagen), with 41–44 exercises per lesson. Example sentences and explanations are written in our own words. Each lesson also has grammar explained in German and Persian, and 229 exercises in total.
- **Zusatz B2** (3 sets, 566 cards): my own selection of core B2 words by topic, plus verbs with prepositions and Nomen-Verb-Verbindungen. No official B2 word list exists.

## Modes

| Mode | What it does |
|---|---|
| **Karteikarten** | Flip cards (click / Space), sort them into ✓ *Gewusst* / ✗ *Noch nicht* (buttons, keys `1`/`2`, or swipe on a phone), then repeat only the missed cards. |
| **Lernen** | Multiple choice with 4 options. Wrong answers come back later in the round. |
| **Schreiben** | See the Persian meaning and type the German word. Articles and *sich* are optional, small typos are recognised, and "Ich hatte recht" overrides. |
| **Grammatik** | Explanation of each grammar topic in German and Persian, with examples and an overview table, plus exercises (multiple choice and gap fill) with explanations. |
| **Fehler** | Every word or grammar question you got wrong, per lesson, with a count. You can practise them again (Lernen / Karteikarten / Schreiben / Grammatik), and each one is removed once you answer it correctly. |
| **Liste** | Full word list with search and star marks. |
| **Hören** | Plays all words of the lesson one after another (word, optionally the example sentence, common expressions and the Persian meaning), at 0.75×–2× speed. Space = start/pause. |
| **Artikel** | Search the article (der/die/das) and plural of every noun on the level, colour-coded, plus an article quiz. |
| **Verben** | Every verb on the level fully conjugated: Präsens, Präteritum, Perfekt, Plusquamperfekt, Futur I/II, Konjunktiv I and II, Imperativ (1,150 verbs, built by `konjugation.js` from their principal parts). |
| **Täglich** (B2) | Five useful sentences a day (100 days, by topic), with Persian translation, notes and read-aloud. |

Other features:
- Front side can be **Deutsch** or **Persisch**.
- Filter by section (A–D), by starred cards or by unlearned cards.
- **Read-aloud everywhere (🔊):**
  - every word, synonym and example sentence
  - the answers in Lernen and Schreiben
  - grammar examples and tables, and the complete correct sentence after each grammar exercise
  - the mistakes list and the word list

  Keys: `A` reads the word, `B` the sentence. Single words are played from **real recordings by native speakers** (Wiktionary / Wikimedia Commons, free licences) when available. Sentences can be read by an optional **natural neural voice** (Piper "Thorsten", runs in the browser, about 65 MB downloaded once) instead of the device voice. The speaker button in the header opens **Stimme & Tempo**: choose the German voice (natural voices are marked ★ and ranked first), test it, set the speed (0.75×–2×) and turn automatic read-aloud on or off. Read-aloud uses the device's built-in German voice (Web Speech API); the page shows a hint if the device has none.
- **Common expressions (Wendungen):** every B2 card shows 2–3 frequent collocations with Persian translation and read-aloud.
- **Tap any word** in an example sentence or expression to see its base form and Persian meaning (glossary of ~12,000 word forms in `shared/glossar.js`).
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
