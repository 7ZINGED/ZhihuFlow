# Domain docs

How the engineering skills consume this repo's domain documentation when exploring the codebase.

## Before exploring, read these

- **`GLOSSARY.md`** at the repo root.
- **`docs/adr/`**: read ADRs that touch the area you are about to work in.

This is a **single-context** repo: one glossary and one ADR directory at the root. There is no `GLOSSARY-MAP.md` and no per-package context.

If a file does not exist yet, proceed silently. Do not flag its absence or suggest creating it upfront; `/domain-modeling` creates glossary entries and ADRs lazily when terms or decisions actually get resolved.

## File structure

```
/
├── GLOSSARY.md
├── docs/
│   ├── adr/
│   │   ├── 0001-local-first-indexeddb.md
│   │   └── ...
│   └── agents/
├── src/
└── .scratch/
```

## Use the glossary's vocabulary

When output names a domain concept (issue title, refactor proposal, hypothesis, test name), use the term as defined in `GLOSSARY.md`. Do not drift to synonyms the glossary explicitly avoids.

Core vocabulary already in use across the codebase includes: 分拣台、粗读、词条分类、精读、标签池、全局聚类、整批单次打标、收藏夹归宿、失效条目、增量安全合并、预演、熔断、批次。Write these down in `GLOSSARY.md` when T04 is worked; until then, match the existing UI copy rather than inventing English or alternative Chinese terms.

If a concept is missing from the glossary, that is a signal: either you are inventing language the project does not use (reconsider), or there is a real gap (note it for `/domain-modeling`).

## Flag ADR conflicts

If output contradicts an existing ADR, surface it explicitly rather than silently overriding:

> _Contradicts ADR-0001 (local-first IndexedDB), but worth reopening because…_
