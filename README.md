# Periodica

Learn the periodic table by playing with it. Short lessons, drag-and-drop puzzles, a daily challenge, quizzes, and "In Real Life" rounds that connect elements to everyday things.

## Run it

```bash
npm install
npm run dev
```

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start the dev server |
| `npm run build` | Type-check and build to `dist/` (static, deploy anywhere) |
| `npm test` | Run the unit tests (data integrity, game rules, scoring, daily seed) |
| `npm run data` | Rebuild `src/data/elements.json` from the PubChem export and the learning content |

## Data

- Element properties: PubChem (NCBI), `scripts/source/pubchem-periodic-table.json`.
- Learning content (summary, uses, fact for each element): `src/data/content-1.json`, `src/data/content-2.json`.
- Progress is stored in the browser's local storage. Nothing is sent to a server.
