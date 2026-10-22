# Entangled

**Hold a qubit in your hand.** A seated, hands-first mixed-reality app where your
hands are a quantum computer. Built for the Meta VR Start Developer Competition
2026 (Productivity track) with the Meta Immersive Web SDK (IWSDK), three.js and
TypeScript.

Every number on screen comes from a real statevector simulator: Bloch arrows
shrink honestly when qubits entangle, measurement follows the Born rule, and
your circuit exports to Qiskit.

## Run it

```sh
npm install
npm run dev        # managed browser with the Quest 3 emulator (IWER)
npm test           # 125 unit tests: physics, gestures, ghost-hand demos, 10 chapters, 15 lessons, notes, puzzles, builder, share links
npm run typecheck
npm run build
```

On a Quest on the same Wi-Fi: run `npx @iwsdk/cli dev status`, open one of the
`runtimeUrls.network` addresses in the Quest browser, accept the local
certificate warning, and tap Enter XR.

![Chapter 4: the ghost hand shows how to touch two orbs together](docs/screenshots/ch4-ghost-hands.png)

## Gestures

A translucent **ghost hand** plays each move on the orb it applies to when a step
starts, then steps aside, and comes back if you stall. Its poses are run through
the real gesture tracker in the tests, so it never demonstrates a move the app
would not recognise.

Every gesture has a poke button on the gate dock and a desktop key, so nothing
depends on a single input path.

| Gesture | Quantum action | Dock button | Desktop key |
| --- | --- | --- | --- |
| Pinch an orb and move | Pick up and place a qubit | – | click to select |
| Turn your wrist while holding | Continuous rotation (Ry), with a glowing trail | Ry- / Ry+ | hold ← → |
| Open hand, fingers spread, palm toward an orb | Hadamard (superposition) | H | H |
| Close your fist near an orb | Measure (collapse) | Measure | M |
| Touch two held orbs together | CNOT (entangle); a gold thread appears | CNOT | C |
| – | Pauli and phase gates | X Y Z S T | X Y Z S T |
| – | 100 shots: probability rain | 100 shots | Space |
| Tap a step on the timeline | Rewind or replay to that step | < start … > | Ctrl+Z / Ctrl+Y |
| – | Show the circuit as Qiskit code | Qiskit | – |
| – | The chapter card's own button (Oracle, Storm …) | blue card button | Enter |
| – | Previous / next chapter, lesson or sandbox circuit | navigator panel | [ ] |
| – | Learn mode | navigator: Learn | L |
| – | SWAP the selected qubit with the next | SWAP | W |
| – | Puzzles | navigator: Puzzles | Q |
| – | Build: circuit builder | navigator: Build | B (then arrows + letters) |
| – | Notes: read (or listen to) the explanation | Notes on the card | I |
| – | Copy a share link to this circuit | Qiskit, then Copy link | – |

Gesture thresholds live in `src/gestures/config.ts` (with hysteresis, hold times
and a shared cooldown, so fist, spread and pinch never trigger each other).

## What's inside

```
src/quantum/   statevector simulator, gates, measurement, Bloch vectors,
               entanglement measures, noise, history, Qiskit/PennyLane export,
               teleportation / Grover / BB84 (pure TypeScript, fully tested)
src/gestures/  hand-joint features and the gesture state machine (tested with a
               synthetic hand, including tracking noise)
src/lab/       the lab model, 3D orbs, threads, GHZ ring, probability rain,
               gesture and desktop input systems, sound, autosave
src/game/      seven chapters, twelve lessons, sandbox presets, the campaign
               state machine, hands-only panels, the ghost-hand tutor
public/ui/     UIKitML panels (chapter card, gate dock, code panel)
```

## Chapters

1. **Superposition** – turn a qubit with your wrist, split it with an open hand, collapse it with a fist.
2. **Interference** – split twice and it comes back to 0, 100 times out of 100.
3. **Entanglement** – two arrows vanish into one shared state; the results always match.
4. **Teleportation** – move your own quantum state to another qubit with one Bell pair and two bits.
5. **Quantum Spy** – BB84: Eve's look leaves errors; 400 photons show 0% without a spy and about 25% with one.
6. **The Search** – Grover: an oracle hides the prize in a phase, one amplification finds it 100 times out of 100.
7. **The Storm** – a lightning strike flips a random qubit; a 3-qubit code finds and repairs it without looking at the message.
8. **Two Bits, One Qubit** – superdense coding: a random two-bit message travels on one qubit of a shared pair, 100 shots out of 100.
9. **One Question** – Deutsch: a sealed box is constant or balanced; one question through phase kickback tells which, for all four boxes.
10. **Hidden Number** – Bernstein-Vazirani on 4 qubits: a random 3-bit number read in one question instead of three.

## Learn

![Learn: the Z gate lesson, target reached](docs/screenshots/learn-z-gate.png)

Fifteen short lessons, one per gate or idea: H, X, Y, Z, S, T, rotation,
measurement, CNOT, SWAP, phase, kickback, no cloning, Bell states and GHZ states. Each lesson explains the
gate in two sentences and sets one challenge. A faint **target arrow** and ring
inside the orb show where the state should end up; the ring turns mint when you
reach it. Lessons are tracked separately from chapters, and every lesson has a
scripted solution in the tests.

The **navigator** panel (upper right) switches between Chapters, Learn and the
Sandbox, and shows what you have finished.

## Puzzles

![A puzzle solved at par, with the circuit board behind the orbs](docs/screenshots/puzzle-solved-board.png)

Twelve "make this state" puzzles, from a single flip to the singlet. The target
is drawn as mint outlines on the circuit board (and as target arrows when a
qubit's target is not entangled). Par is the length of a reference solution:
3 stars at par or under, 2 within two moves, 1 for any solution. Any route to the
same state counts, global phase is ignored, relative phase is not.

## Gates you can see

When a gate starts, the orb draws the exact circle the arrow tip is about to
travel (the gate's rotation axis and angle, starting from the current state) with
an arrowhead, so every single-qubit gate reads as what it is: a rotation. The
gate's name ("H", "Ry +45°") rises out of the orb; two-qubit gates send a gold
spark from control to target; a measurement shows "M = 1". A wrist turn is shown
live by the hand and is not replayed when it is released.

## Notes

![Notes for the Z gate lesson](docs/screenshots/notes-z-gate.png)

Every chapter, every lesson and the builder has **Notes**: three to five short
paragraphs in plain English that explain the idea behind it, the math in simple
form (|0>, sqrt(2), matrices), the Qiskit call, and where it is used in the real
world, ending with one highlighted key idea. The card's Notes button opens them a
page at a time; **Listen** reads the page aloud with the browser's speech engine,
so nothing has to be read in the headset. All notes text is checked in the tests
to be plain ASCII (the panel font has no special symbols) and to fit the panel.

## Build: circuit builder

![The builder: a Fredkin gate from a Toffoli and two CNOTs, in cross-dot notation](docs/screenshots/build-fredkin.png)

A fifth tab turns the gate dock into a grid editor written in standard circuit
notation: filled dots (controls), open dots (anti-controls), circled-plus targets
and swap marks. Dots control every gate in their column, so a dot over a plus is a
CNOT, two dots a Toffoli, a dot with two swap marks a Fredkin. Every edit runs on
the orbs, the circuit board and the timeline immediately.

Ten tools are new beyond the dock: S dagger, T dagger, square root of X and its
dagger, Rx, Rz, control, anti-control, target and swap.

Ten challenges are checked as whole gates (the same output for every input, up to
one global phase), not just one state: Z from H and X, X from square roots of X,
T dagger from seven Ts, CZ from a CNOT, a reversed CNOT with dots only on q0, an
open dot built from X, controlled-Y, SWAP from three CNOTs, a Fredkin from a
Toffoli, and (expert) a Toffoli from two-qubit gates, H, T and T dagger. Rules
block the easy way out, par is the reference solution's step count, and stars
work like puzzles. Desktop: arrows move a cursor; H X Y Z S T place gates (Shift
for the daggers), V is SX, 1 2 3 are Rx Ry Rz, C a dot, O an open dot, P a plus,
W a swap mark.

## Circuit board

A board at the back of the desk shows the circuit so far as a standard diagram
(gate boxes in each qubit's colour, gold CNOT dots and targets, faded steps after
a rewind, a blue cursor) and the full state as circles: the filled area is a
basis state's probability, the hand is its phase.

## Share links

The Qiskit panel has **Copy link**: a short, readable link such as
`#c=3_h0/x1c0/x2c1/M0=1` that opens the circuit, recorded measurement outcomes
included, in anyone's sandbox. Links are validated before anything is loaded.

## Sandbox

Up to 5 qubits, every gate unlocked, plus ready-made circuits: Bell pair, GHZ
(3 and 5 qubits), an even superposition of 16 outcomes, a finished
teleportation to scrub through, and one round of Grover's search.

Each qubit keeps one colour everywhere (arrow, trail, desk label, timeline step,
outcome digit). Gold is reserved for entanglement: threads, cores, the GHZ ring
and multi-qubit gates on the timeline.

See `DECISIONS.md` for design choices and `TODO.md` for the plan to the Nov 17 submission.
