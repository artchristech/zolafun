# Build wrapper (identical every round)

The builder is a fresh agent with no memory of earlier rounds. It receives
this wrapper with {N} filled in, followed by the round's prompt.

---

Build the browser game described in the prompt below, in one shot.

- Work in /home/user/zolafun. Put everything in public/archipelago-v{N}/:
  an index.html plus flat JS modules and any assets, all in that one folder
  (no subfolders), relative imports only. Static files, no build step, no
  network access at runtime.
- For Three.js, copy public/archipelago/three.module.min.js (r170) into your
  folder. That is the only file you may read outside your folder. Do not look
  at any other public/archipelago* folder or at evals/.
- Do not open the game in a browser, run playthroughs or take screenshots.
  Syntax checks (node --check) are fine.
- Do not commit, push or publish.
- When done, reply with: the file list with line counts, the bugs you caught
  and fixed while writing, and anything in the prompt you did not do.

The prompt:
