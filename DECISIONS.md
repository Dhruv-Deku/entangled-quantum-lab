# Decisions

Choices made for Entangled, newest last, with the reason for each.

## 2026-10-22

- **Track: Productivity.** Registered for the Meta VR Start program; rules read.
- **Stack: IWSDK 1.0.1 (three.js, TypeScript, Vite)**, scaffolded with `npm create @iwsdk@latest`.
  WebXR ships as a hosted link, no APK, and the project's MCP tools let the agent drive the emulator.
- **Quantum engine is pure TypeScript with no rendering imports** (`src/quantum/`), so it is
  fully unit tested and reusable by every chapter.
- **Qubit order is little-endian, same as Qiskit**: qubit k is bit k of the basis index.
  Exports to Qiskit need no reordering; the PennyLane export notes that its probability order is reversed.
- **Entanglement visuals use two measures**: pairwise negativity draws the gold thread between two orbs;
  per-qubit mixedness (1 - |r|^2) dims an orb. GHZ states have no pairwise entanglement but full mixedness,
  so they need a group visual, not threads.
- **Gates are data**: one table entry per single-qubit gate; multi-qubit gates are controlled versions,
  swap and iswap. `fractional(U, t)` animates any gate along its true rotation, including controlled gates.
- **"100 shots" samples without collapsing the live state**; a fist (measure) collapses it.
- **Measurements record their outcome** in the history, so undo, redo, scrubbing and save/resume replay exactly.
- **Noise uses quantum trajectories on the statevector** (no density matrix needed for The Storm).
- **Vitest has its own config** so tests run without the IWSDK dev plugin; test files have their own tsconfig.
- **Gesture set kept small** (from the research brief): pinch-grab, wrist rotate, fist to measure,
  spread for Hadamard, touching two held orbs to entangle. Flick and shake dropped; every gesture has a poke-button twin.

## 2026-10-22 (evening)

- **AR mode with passthrough by default**; the virtual room hides automatically when the
  session blends with the real world, and shows on desktop or VR.
- **The desk workspace is seated relative to the head** when a session starts (40 cm ahead,
  42 cm below the eyes), and only once the head is actually tracked.
- **Wrist rotation previews live and commits as one Ry gate** on release, so the timeline
  stays readable and autosave never commits a half-finished turn.
- **Orb root is the glass mesh itself**, and decorations ignore pointers, so grab and ray
  hit-testing only ever see the glass body. (Tried while chasing the grab bug below; kept as a
  simplification, not the fix.)
- **Poke pauses near orbs**: IWSDK's poke pointer hovers 20 cm out and beat the grab pointer
  when a panel was nearby. Panels drop PokeInteractable while a hand is within 14 cm of an orb
  (back on past 20 cm); ray clicks keep working.
- **Panels around the desk**: chapter card left, gate dock right-front (right-hand reach),
  rain in front, code panel above. Left-handed mirror is a TODO.
- **Chapter steps can choose the CNOT control** (teleportation needs q0 as control even though
  q1 is closer to 50/50); otherwise the qubit nearer an even superposition controls.
- **GHZ ring**: qubits that are entangled (mixedness > 0.5) but have no entangled partner get a
  gold ring instead of threads, which is what the physics says.
- **UIKit text ignores line breaks**: the code panel uses one element per line.

## 2026-10-22 (night)

- **Qubit colours**: each qubit has one colour (coral, teal, lavender, leaf, pink) for its
  arrow, trail, equator, desk label, timeline steps and outcome digits. Gold still only means
  entanglement; Horizon blue only means "the button to press"; mint means done.
- **Card actions** for things no gesture does (Grover's oracle and amplifier, the BB84 batch,
  the storm, the Toffoli repair). The blue Continue button becomes that action until the goal
  is met; Enter presses it on desktop. Every action is a real circuit, so it shows on the
  timeline and in the Qiskit export.
- **The Search marks a random box** each run, so replaying it is not memorisable.
- **The Storm repairs with a Toffoli after decoding**, rather than measuring the syndrome:
  nobody looks at anything, which is the point of the chapter.
- **Ghost hand uses the same synthetic hand as the tests.** Demo poses live in
  `src/gestures/demos.ts`; tests play each demo through the real tracker and expect exactly
  the gesture it teaches (spread → one Hadamard per loop, fist → one measure, twist → pinch
  plus wrist roll). It plays for two loops when a step starts and returns after 9 s idle.
- **Desktop C key and the dock CNOT use the step's control qubit** acting on the selected
  qubit, so "Press 1, C, then 3, C" works for the 3-qubit code.
- **The last result stays on the card** next to the chapter's closing line, so a fidelity or
  error rate is not replaced after two seconds.
- **Virtual room**: felt work mat, lit back wall, desk edge; the desktop camera sits closer,
  nearer a seated view. Passthrough still hides the room.

## 2026-10-23

- **Learn mode reuses the chapter machinery**: a lesson is a one-step chapter with a target.
  Goals, ghost-hand hints, payoffs, autosave and the timeline all work unchanged; the campaign
  just has a third mode. Lessons and chapters keep separate progress.
- **Target arrows** (a faint arrow plus a ring on the sphere) show where a lesson wants the
  state. The ring grows and turns mint on arrival and stays after the goal is met, so success
  is visible on the orb, not only on the card. Tests check each target matches the solved state.
- **Lesson goals check the method when it matters**: the T lesson only accepts T gates, the
  Phase lesson only Z and H, so a lesson cannot be passed with the gate it is not about.
- **Navigator panel** replaces the chapter strip and mode button on the card: tabs for Chapters,
  Learn and Sandbox, a 3-column grid, progress counts. It sits upper right, mirroring the
  chapter card, above the dock.
- **Pole labels** (0 on top, 1 below) on every orb, as sprites that always face you.
- **Measurement ripple**: a white ring leaves the measured orb; entangled partners ripple
  gold in the same instant. **Thread bead**: a small bead travels along each strong gold
  thread.
- **Ghost hand for spread and fist faces the orb from the player's side**, palm toward it,
  fingers rising: the back of the hand and the fan of fingers read clearly from a seated view.
  A restarted step replays its demo.
- **Sandbox presets live in the campaign** so `[ ]` can cycle them from the keyboard and tests
  can check each circuit does what its note says.
- **Puzzles define their target by a reference solution**, so each is solvable by construction
  and par is that solution's length. Solved = fidelity with the target above 0.999: any route
  counts, global phase is ignored, relative phase matters (the Minus pair is not the Chapter 3
  pair). Best stars are kept per puzzle.
- **Circuit board** is a canvas texture on a plane behind the orbs (0.5 m wide, far enough back
  that orbs never hide it). It redraws only when the committed state changes, and at most
  ~12 times a second during a wrist turn, so it costs nothing while idle in a headset.
  Amplitudes are drawn the way Quirk does (area = probability, hand = phase) instead of a
  phase colour wheel, which would put gold where it does not mean entanglement.
- **Share links are plain text** (`3_h0/x1c0/...`), not base64: short, readable, and strictly
  validated (qubit range, gate names, parameter counts) before loading. Outcomes are included
  so a shared circuit replays exactly. The app also listens for hash changes, so pasting a link
  into an open tab works without a reload.
- **Gate path arcs**: for a single-qubit gate the orb draws the circle the tip will travel
  before it moves (from `decompose`: axis and angle; radius and offset from the current Bloch
  vector), so the arrow visibly follows a planned rotation. Controlled gates show a name and a
  gold spark instead, since the target alone is not a rotation then.
- **Committed wrist turns are not replayed**: the lab marks them `live`, and the visuals only
  label them. Previously the arrow jumped back and re-animated the turn on release.
- **Chapters 8-10 randomise their secret** (message, box rule, hidden number) through the lab's
  seeded generator, and tests cover every case. Step text and goals can now depend on the
  chapter's memory, so the card can say "Message 10 ... Here: X".
- **Navigator grid is 15 slots** (5 rows of 3) for 15 lessons and 10 chapters.
- **Builder challenges compare whole gates**: the built circuit and the target are run on every
  basis input; all overlaps must have magnitude 1 and the same phase. A circuit that only works
  on |00> does not pass, and global phase is ignored (Rz(90) counts as S).
- **Quirk column semantics**: dots apply to every gate in their column; open dots compile to X
  on both sides. This keeps the grid honest to the standard diagram, and is why H on one wire
  and a CNOT on two others must sit in different columns.
- **Builder cells are drawn with plain boxes**, not glyphs: the panel font has no dots, circled
  plus or dagger, so dots and rings are rounded boxes sitting on the wire, a target is a ring with
  a "+", and dagger gates are labelled Sdg/Tdg/SXdg (Qiskit's names). The wire is the outer box of
  every mark, so it never breaks.
- **The builder replaces the dock in the Build tab** (same place, same reach); hidden panels are
  parked far below the floor so no pointer can hit them. The grid is saved with the session.
- **New gate `sxdg`** (square root of X, dagger) with Qiskit and PennyLane export names.
- **Notes are separate from the card text**: the card stays one or two sentences of "what to do",
  and the Notes panel holds the "why" (3-5 paragraphs ending with a key idea) for every chapter,
  lesson and the builder. Notes are written in ASCII (|0>, sqrt(2)) and tested for it, because
  the panel font draws anything else as a square. Read-aloud uses the Web Speech API; it turns
  |01> into "zero one" and skips matrices and code, and the button hides where speech is missing.

