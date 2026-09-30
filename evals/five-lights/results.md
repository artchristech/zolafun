# Five Lights — prompt eval results

Each prompt is built one-shot into its own folder. Scores are self-graded from
the code, not from play. From Output 2 on, builds run in a fresh agent and
build time, tokens and tool calls come from the harness's own count; Output 1's
figures are rough estimates.

| Prompt | Output | Controls | Build time | Tokens | Tool calls | Lines of code | Bugs caught in build | Rating |
|---|---|---|---|---|---|---|---|---|
| Prompt 1 (plain, no skill) | Output 1: `public/archipelago/`, [play](https://claude.ai/artifact/3CSmyhrufRU8mXCCG8pqdT) | Touch, keyboard/mouse, controller (follow-up) | ~44 min (+~5) | ~240k (rough, session counter) | ~55 | 2,965 | 7 | 7.5/10 |
| Prompt 2 | Output 2: `public/archipelago-v2/`, [play](https://claude.ai/artifact/JUBC3PdnZQPhGuQU3UF1Yj) | Keyboard/mouse + controller | 49 min | 364k (harness count) | 69 | 5,486 | 11 | 8/10 |
| Prompt 3 | Output 3: `public/archipelago-v3/` | Keyboard/mouse + controller | ?? | ?? | ?? | ?? | ?? | ?? |
