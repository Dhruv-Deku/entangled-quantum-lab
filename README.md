# Entangled

**Hold a qubit in your hand.** A seated, hands-first mixed-reality app where your
hands are a quantum computer. Built for the Meta VR Start Developer Competition
2026 (Productivity track) with the Meta Immersive Web SDK (IWSDK), three.js and
TypeScript.

Every number on screen comes from a real statevector simulator: Bloch arrows
shrink honestly when qubits entangle, measurement follows the Born rule, and
your circuit exports to Qiskit and OpenQASM 3.

![Chapter 10, Hidden Number: four qubits, the circuit board above them and 100 shots that all read 1101](docs/screenshots/ch10-hidden-number.png)

## Run it

```sh
npm install
npm run dev        # managed browser with the Quest 3 emulator (IWER)
npm test           # 159 unit tests: physics, gestures, ghost-hand demos, 11 chapters, 15 lessons, notes, puzzles, builder, share links, simplifier, OpenQASM, code window, chip routing, noise and pulse schedules
npm run typecheck
npm run build
```

On a Quest on the same Wi-Fi: run `npx @iwsdk/cli dev status`, open one of the
`runtimeUrls.network` addresses in the Quest browser, accept the local
certificate warning, and tap Enter XR.

![In mixed reality: the panels and orbs sit on your real desk, with hand tracking](docs/screenshots/ar-passthrough-hands.png)

## Gestures

![Chapter 4: the ghost hand shows how to touch two orbs together](docs/screenshots/ch4-ghost-hands.png)

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
| – | Code window: Qiskit, OpenQASM 3 or PennyLane tabs | Qiskit, then a tab | K, then G |
| – | Zoom the code window and notes (bigger, at eye level) | Zoom | = |
| – | Page through long code | Back / More | Up / Down |
| – | Route onto the 5-qubit chip and run with hardware errors | Qiskit, On chip, Run on chip | K, G to On chip, O |
| – | Simplify the circuit (Undo brings it back) | Qiskit, then Simplify | O |

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
src/game/      eleven chapters, fifteen lessons, twelve puzzles, the circuit builder,
               notes, sandbox presets, the campaign state machine, hands-only
               panels, the ghost-hand tutor
public/ui/     UIKitML panels (chapter card, gate dock, code, navigator, builder,
               notes)
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
11. **The Mystery Qubit** – state tomography: a sealed box hides a random state; look at 100 copies along Z, X and Y, rebuild the arrow with your wrist and T, then reveal how close you came.

| Chapter 3: measure one qubit and the other always agrees | Chapter 8: two bits sent on one qubit, 100 of 100 shots |
| --- | --- |
| ![Entanglement: 100 shots land only on 00 and 11](docs/screenshots/ch3-entangled-rain.png) | ![Superdense coding: every shot reads 10](docs/screenshots/ch8-superdense.png) |

## Learn

| Z gate: the target ring turns mint | Kickback: the control flips, the target stays put |
| --- | --- |
| ![Learn: the Z gate lesson, target reached](docs/screenshots/learn-z-gate.png) | ![Learn: the phase kickback lesson, both targets reached](docs/screenshots/learn-kickback.png) |

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

| Challenge 10: a Fredkin from a Toffoli and two CNOTs | Free build: every tool, the orbs run it live |
| --- | --- |
| ![The builder: a Fredkin gate in cross-dot notation](docs/screenshots/build-fredkin.png) | ![Free build: a GHZ state followed by single-qubit gates](docs/screenshots/build-free.png) |

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

## The Mystery Qubit

![Chapter 11: three looks of 100 copies each, the rebuilt qubit and the revealed state, fidelity 0.96](docs/screenshots/ch11-mystery-qubit.png)

One copy of an unknown qubit tells you one bit. The box makes copies, so you
look at 100 of them along each axis (a Hadamard first for X, S dagger and H for
Y) and the counts land on the rain. Your estimate appears as a faint arrow; you
rebuild it on your own qubit with a wrist turn and T gates (45 degree steps
around the vertical axis), then Reveal draws the real state and the fidelity.
With 100 copies per axis it lands within about 0.1 of the truth, which the tests
check across 30 random states.

## Code window: tabs, zoom, simplify

![The code window zoomed, seen from the headset: tabs for Qiskit, OpenQASM 3 and PennyLane, numbered lines](docs/screenshots/code-window-zoom.png)

The **Qiskit** button opens the code window: the whole program, not just the
gates, as **Qiskit**, **OpenQASM 3** (the text format IBM Quantum, Qiskit and
Amazon Braket read; any controlled gate is written exactly with `ctrl @`) or
**PennyLane**, one tab each. Lines are numbered with the gate or call name
picked out, ten to a page with Back and More, and a new step keeps you on the
last page. **Zoom** makes the window 1.3 times bigger and brings it to eye level
just above the orbs, where code is readable in a headset; Unzoom puts it back.
The Notes panel shares the same Zoom.

![The code window in OpenQASM 3 after Simplify: 7 steps down to 2](docs/screenshots/code-simplify-qasm.png)
 **Simplify** shortens the circuit the way a
compiler's first passes do: gates that undo each other cancel (H H, S S dagger,
CNOT CNOT), gates that add up merge (T T is S, two SX are X, rotations add), and
gates slide past others they commute with so more of them meet, e.g. a Z on a
CNOT's control passes through it. Measurements and classically controlled gates
never move. In the sandbox the circuit is replaced and Undo brings yours back;
in a chapter the panel only previews the shorter version.

Both exports and the simplifier were cross-checked against Qiskit 2.5 (the QASM
loaded with `qiskit.qasm3.loads`, every circuit compared as a full unitary) on
60 random circuits with every gate, one and two controls, swaps and iSWAP. The
unit tests check the simplifier on 300 random circuits, and that every pair of
gates it calls commuting really does.

## On a real chip

![Run on chip: the routed circuit, the T5 chip at the upper right, and 1000 noisy shots that agree 87% with the ideal circuit](docs/screenshots/chip-run.png)

Real quantum chips only wire each qubit to its neighbours. The code window's
**On chip** tab maps your circuit onto **T5**, five superconducting qubits in a
T (the layout of many early cloud quantum computers), the way a compiler does:
gates with two controls are broken into one- and two-qubit gates (the textbook
Toffoli circuit, with Fredkin and CCZ built from it), every placement of your
qubits on the chip is tried, and SWAPs are added wherever a two-qubit gate's
qubits are not neighbours. A SWAP in your own circuit costs nothing: the
compiler just relabels which physical qubit holds which logical one. The tab
shows the routed OpenQASM on physical qubits Q0 to Q4 and what routing cost
("1 SWAP added: 3 two-qubit gates became 6").

**Run on chip** runs 1000 shots with typical hardware errors (1% per CNOT, 0.1%
per single-qubit gate, 2% readout), rains the counts on the desk and says how
far they are from the ideal circuit. A lit 3D model of the chip floats beside
the board: a silicon die with aluminium cross-shaped qubits, couplers, readout
resonators and wire bonds. Each qubit is tinted with the colour of the logical
qubit it holds, the run plays back on it, couplers flash gold for entangling
gates, and routing SWAPs visibly move the colours from qubit to qubit.

The tests check routing on 120 random circuits (every two-qubit gate lands on a
coupler, and the routed circuit is the same unitary through the start and end
layouts), the decompositions, and that the noise model behaves: no noise
matches the ideal, readout flips about 2%, and SWAPs cost fidelity.

![The T5 chip from the headset, beside the code window](docs/screenshots/chip-headset.png)

### Inside the machine

![From the headset during a run: the dilution refrigerator, the pulse schedule with its sweeping cursor, the code window, the chip and the falling shots](docs/screenshots/quantum-hardware.png)

On the chip tab the rest of the machine appears. A **dilution refrigerator**
stands at the back left: five copper cooling stages from 50 K down to 15 mK on
steel rods, a coaxial line per qubit coiling down to the chip package, and a
status light on the top flange (blue when ready, mint when a run finishes).
During a run each drive pulse travels down its qubit's line as a bead in that
qubit's colour, two-qubit pulses go down in gold, and readout tones come back
up in white.

The circuit board rises above the code window and shows the **pulse
schedule**: what the routed circuit looks like to the control electronics. One
line per physical qubit; single-qubit gates are 36 ns Gaussian pulses whose
height is the rotation angle; Z, S, T and other Z rotations take no time at all
(the electronics just shift the phase of later pulses, so they are drawn as
ticks); two-qubit gates are 280 ns cross-resonance pulses in gold; a SWAP is
three of them; readout is a 1.2 us tone. Gates start as early as their qubits
are free, so the timeline shows real parallelism and how much time routing
SWAPs add. A blue cursor sweeps across it while the run plays.

![The pulse schedule up close: gold cross-resonance pulses, routing SWAPs, readouts, and the run cursor at about 4 us of 11](docs/screenshots/pulse-schedule.png)

Windows now settle into place when they open, and Zoom glides between sizes
instead of jumping.

## Circuit board

A board at the back of the desk shows the circuit so far as a standard diagram
(gate boxes in each qubit's colour, gold CNOT dots and targets, faded steps after
a rewind, a blue cursor) and the full state as circles: the filled area is a
basis state's probability, the hand is its phase.

![One round of Grover's search on the board: the full circuit, and all 100 shots on 11](docs/screenshots/sandbox-grover.png)

## Share links

The Qiskit panel has **Copy link**: a short, readable link such as
`#c=3_h0/x1c0/x2c1/M0=1` that opens the circuit, recorded measurement outcomes
included, in anyone's sandbox. Links are validated before anything is loaded.

![A shared link opened: a GHZ circuit with the recorded measurement M0 = 1](docs/screenshots/shared-circuit.png)

## Sandbox

Up to 5 qubits, every gate unlocked, plus ready-made circuits: Bell pair, GHZ
(3 and 5 qubits), an even superposition of 16 outcomes, a finished
teleportation to scrub through, and one round of Grover's search.

| Bell pair: 100 shots, only 00 and 11 | GHZ x5: five qubits, one shared coin |
| --- | --- |
| ![Sandbox: a Bell pair with probability rain](docs/screenshots/sandbox-bell-rain.png) | ![Sandbox: a five-qubit GHZ state with the gold ring](docs/screenshots/sandbox-ghz5.png) |

Each qubit keeps one colour everywhere (arrow, trail, desk label, timeline step,
outcome digit). Gold is reserved for entanglement: threads, cores, the GHZ ring
and multi-qubit gates on the timeline.

See `DECISIONS.md` for design choices and `TODO.md` for the plan to the Nov 17 submission.
