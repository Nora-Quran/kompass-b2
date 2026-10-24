# Deutsch A1 · A2 · B2 · Karteikarten

Quizlet-style flashcards, grammar explanations and a mistakes trainer for **Kompass DaF B2** (Klett). Every word has a German synonym, an example sentence and a Persian (فارسی) translation. Grammar is explained in German and Persian.

**Levels (switch in the header):**
- **B2** (start page `/`): Kompass DaF B2, Lektion 1–10, plus extra B1/B2 vocabulary.
- **A1** (`/A1/`): 10 thematic units, 810 cards, 20 grammar topics, 214 exercises.
- **A2** (`/A2/`): 10 thematic units, 687 cards, 20 grammar topics, 214 exercises.

The A1/A2 words come from the official Goethe-Zertifikat A2 word list, which contains the whole basic vocabulary. It is split into A1 and A2 by the Start Deutsch 1 level. Progress is saved separately for each level.

**B2 content:**
- **Lektion 1–10** (the whole book): 1,772 cards from the official lesson word lists, plus extra words from the listening texts and lesson tests. Each lesson also has grammar explained in German and Persian, and 229 exercises in total.
- **Zusatz B1** (6 sets, 1,281 cards): words from the official Goethe B1 word list that are neither in the Goethe A2 list nor in the book.
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

Other features:
- Front side can be **Deutsch** or **Persisch**.
- Filter by section (A–D), by starred cards or by unlearned cards.
- **Read-aloud everywhere (🔊):**
  - every word, synonym and example sentence
  - the answers in Lernen and Schreiben
  - grammar examples and tables, and the complete correct sentence after each grammar exercise
  - the mistakes list and the word list

  Keys: `A` reads the word, `B` the sentence. You can turn on "automatisch vorlesen" (read the German word automatically) and "langsam" (slower speech). Read-aloud uses the device's built-in German voice (Web Speech API); the page shows a hint if the device has none.
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
