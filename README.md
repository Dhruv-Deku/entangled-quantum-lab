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
npm test           # 242 unit tests: physics, gestures, the course, 18 chapters, 15 lessons, puzzles, builder, noise, chemistry, import, IBM compiling, voice, shared rooms and more
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
| – | Course: everything, in order, with quizzes | navigator: Course | A (1 2 3 answer, J = Show me) |
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
| – | The maths of each step: matrix, formula, state vectors | Qiskit, Maths | K, G to Maths, then Ctrl+Z / Ctrl+Y |
| – | Run on a real IBM quantum computer | Qiskit, On chip, Run on IBM | Shift+O on the On chip tab |
| – | Noise lab: T1, T2, gate error, zero-noise extrapolation | sandbox card: Noise | E (Shift+E on/off, Shift+M mitigate) |
| – | Library: save, load, import, QR code, custom gates | sandbox card: Library | F (Shift+F save, U tab, Shift+Y use, Shift+K QR, Shift+U import) |
| – | Simplify the circuit (Undo brings it back) | Qiskit, then Simplify | O |
| – | Step debugger: step, run to a breakpoint, see why each step changed the state | Debug | Shift+D (, . step, ; run, ' breakpoint) |
| – | Big-state views: Q-sphere, state city, entanglement map | View | Shift+V |
| – | Voice commands | Voice | V |
| – | Shared lab or classroom: start, join, claim a qubit | Share | \ (and \| for the class panel) |

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
               panels, the ghost-hand tutor, voice commands, the step debugger
src/net/       shared rooms: one circuit for everyone, qubit ownership, the
               classroom (assignments, progress), WebSocket and same-device
               transports
server/        the room relay (built into the dev and preview servers, or
               standalone with `node server/relay.mjs`)
public/ui/     UIKitML panels (chapter card, gate dock, code, navigator, builder,
               notes, noise, library, debugger, classroom)
```

## Course

![A course quiz answered: the right answer in mint, with its explanation held until Continue](docs/screenshots/course-quiz.png)

The **Course** tab teaches everything, in order, in 14 modules: bits and
qubits, superposition, measurement, gates as matrices, phase and interference,
many qubits, entanglement, algorithms, teleportation, noise and errors, quantum
hardware, compiling, variational algorithms (QAOA), and what next. Each module
mixes three kinds of step:

- **pages**: a short explanation, often with a live demo on the orbs while the
  board shows the matrices, or (in the hardware module) the chip, the fridge and
  the pulse schedule;
- **tasks**: do it yourself with the gestures, or tap **Show me** and watch it done;
- **quizzes**: three answers on the card; a wrong one turns red and you try
  again, the right one turns mint and explains why.

Progress is saved per module. The tests play the whole course start to finish
the way a learner would, and check that a wrong answer waits.


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
12. **Max Cut** – QAOA: optimise a variational circuit's two dials on the cost landscape, then two layers, and watch the best cuts dominate the shots.
13. **Phase Wheel** – the quantum Fourier transform turns the number 5 into angles you can see on phase wheels, and back.
14. **Phase Estimation** – phase kickback and an inverse QFT read a gate's secret angle in binary.
15. **Factoring 15** – Shor's algorithm (compiled): the period of 7^x mod 15 is 4, so 15 = 3 x 5.
16. **The H2 Molecule** – VQE on a real chemistry Hamiltonian: Hartree-Fock, then the exact ground energy, then the whole bond curve.
17. **Search 8 Boxes** – Grover on three qubits: two rounds, 94.5%.
18. **Simon's Secret** – the first exponential quantum speedup: the readings name a hidden bit string.

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

## QAOA: a variational algorithm

![QAOA on the board: the ring of four with its best cut, the cost landscape over gamma and beta, and the optimiser's path into the minimum](docs/screenshots/qaoa-landscape.png)

Chapter 12 and the course's QAOA module solve **MaxCut** on a ring of four
qubits: split the nodes into two teams so every edge crosses. The cost
Hamiltonian is H_C = sum of 1/2 (Z_i Z_j - 1) over the edges (PennyLane's
convention), so each split's energy is minus the edges it cuts. The QAOA
circuit (Hadamards, then per layer CNOT, Rz(gamma), CNOT on every edge and
Rx(2 beta) on every qubit) runs on the orbs; **Optimize** walks gradient
descent across the landscape, which the board draws over both dials with the
optimiser's path; the card reports <H_C> and the approximation ratio
<H_C> / min(H_C). One layer reaches the known 0.75 on a ring; **Deeper** adds a
second layer for more. The shots then favour 0101 and 1010, the best cuts.

The **PennyLane** tab exports the run as a program in the usual exercise shape
(`cost_hamiltonian`, `qaoa_circuit` with `qml.qaoa.cost_layer` and
`mixer_layer`, `qaoa_expval`, `qaoa_probs`, `approximation_ratio`) with the
parameters found. Run with PennyLane 0.42 it prints exactly the same <H_C> and
ratio as the app: -3.000 / 0.750 for one layer on the ring, -3.4573 / 0.8643
for two layers on a kite.

## Run on a real quantum computer

The code window's **On chip** tab has **Run on IBM**: your circuit runs on an
actual IBM Quantum computer through your own IBM Quantum Platform account (the
free Open Plan works). Add your API key and instance CRN once on the 2D page
(the **IBM Quantum** button at the bottom right; they stay in this browser).
The app then does what Qiskit's transpiler does at its simplest:

- picks the least busy operational backend with CZ gates (IBM Heron), reads its
  wiring and calibration, and chooses a connected group of good qubits;
- routes the circuit onto them, adding SWAPs where qubits are not wired;
- rewrites every gate in the chip's native set: one-qubit gates become
  RZ SX RZ SX RZ from their Euler angles, controlled gates become CNOTs and
  one-qubit gates, and each CNOT is a CZ between Hadamards;
- submits a 1000-shot Sampler job as OpenQASM 3 on the physical qubits, polls it
  (it survives a reload), and rains the real counts on the desk next to how
  close they are to the ideal circuit and to the noise model's prediction.

Tests check the native translation (same unitary for every gate), compiling 40
random circuits onto a heavy-hex fragment (native gates only, wired pairs only,
same result through the layouts), Qiskit parsing the output as RZ/SX/CZ only,
and the client's requests against a scripted stand-in for IBM's API (paths,
`Service-CRN`, `IBM-API-Version: 2026-04-15`, the Sampler body). Through the dev
server's proxy, IBM's live login and API both answer a fake key with the
right rejection. A real hardware run needs your key, so it is the one step
not run here; queues on the free plan can take minutes.

Browsers cannot call IBM's servers directly (CORS), so `vite.config.ts`
forwards `/ibm-iam`, `/ibm-api` and `/ibm-api-eu`; a hosted build needs the
same three forwards.

## Noise lab

![The noise lab: density matrix, Bloch lengths, purity and zero-noise extrapolation](docs/screenshots/noise-lab.png)

In the sandbox, **Noise** (or E) opens the noise lab. Turn it on and every gate
runs as on a real chip: depolarizing error (ten times more for two-qubit gates),
**T1** energy loss and **T2** dephasing during each gate's duration (36 ns, 280
ns, 1.2 us readout). The orbs show the mixed state, so arrows shrink inside the
spheres; shots sample it; and the board shows the **density matrix** (square
size = |rho_ij|, probabilities on the diagonal, coherences off it), each qubit's
Bloch length and the purity. **Mitigate** runs **zero-noise extrapolation**: the
fidelity with the ideal state at 1x, 2x and 3x the noise, fitted back to zero.

The density-matrix simulator matches the statevector exactly without noise,
gives e^(-t/T1) decay and T2 dephasing, and matches Qiskit's `quantum_info`
density matrices with the same channels to 3e-16.

## Library, import and custom gates

- **Library** (sandbox card, or F): My circuits and My gates, saved on this
  device. The board shows them as thumbnails; Load opens a circuit.
- **Import** reads OpenQASM 2 or 3 and Qiskit code, pasted on the 2D page.
  Every exported program reads back as the same circuit (120 random round trips
  each), and QASM written by Qiskit itself imports exactly.
- **QR code** draws the current circuit's share link on the board; a phone
  camera opens it (checked by decoding the rendered code). Where the browser
  has a barcode detector and a camera, the import dialog can scan one too.
- **Make gate** turns the circuit on the orbs into one reusable block: tiles
  G1-G3 in Build (a dot in the column controls the whole block), or Apply in the
  sandbox onto the selected qubit and up.
- Builder rotations take any angle in steps of pi/8 (, and . on a keyboard),
  and the Maths tab shows every one-qubit gate's Euler angles,
  U = e^{i a} Rz(phi) Ry(theta) Rz(lambda), checked to rebuild 50 gates exactly.

## Algorithm chapters

| QFT phase wheels | VQE for H2 |
| --- | --- |
| ![The phase wheels after the QFT of 5: 5/8, 2/8 and 4/8 of a turn](docs/screenshots/phase-wheels.png) | ![The H2 energy curve: Hartree-Fock dashed, exact solid, VQE points on it](docs/screenshots/vqe-h2.png) |

Chapters 13-18 add the QFT (phase wheels on the board), phase estimation, Shor
factoring 15 (a compiled modular exponent, said so on the card), VQE for the H2
molecule, Grover on eight boxes and Simon's algorithm. The H2 Hamiltonians are
real: generated with PennyLane's quantum chemistry (STO-3G, Jordan-Wigner, 4
qubits) by `scripts/gen-h2.py`; VQE reaches the exact ground energy at all 24
bond lengths, and the minimum sits at 0.74 Angstrom. Tests check the QFT
against the discrete Fourier transform, phase estimation for every k/8, Shor's
period and factors, Grover's 94.5%, and Simon's secret.

## The maths of every step

![The Maths tab: CX as a 4x4 matrix with kets on the rows, its formula, U = CX, the state before and after as column vectors, and the new state in Dirac notation](docs/screenshots/maths-board.png)

The code window's **Maths** tab turns the circuit board into a page of linear
algebra for the current step, and follows the timeline, so Ctrl+Z / Ctrl+Y (or
tapping a step) walks through the whole circuit one matrix at a time:

- **the gate as a matrix** on the qubits it touches (2x2, 4x4 for two-qubit
  gates, 8x8 for a Toffoli or Fredkin), rows labelled with kets in Qiskit's
  order, zeros dimmed, and a shared factor pulled out, so H reads
  1/√2 [[1, 1], [1, −1]];
- **its formula**: H = (X + Z)/√2, Ry(θ) = e^{−iθY/2} = cos(θ/2) I − i sin(θ/2) Y
  with the step's θ filled in, C-U = |0⟩⟨0| ⊗ I + |1⟩⟨1| ⊗ U, and for a
  measurement the projector P = |1⟩⟨1| with |ψ⟩ → P|ψ⟩ / ‖P|ψ⟩‖;
- **where it sits in the register** as a tensor product: U = I ⊗ H ⊗ I;
- **the state before and after** as column vectors (up to three qubits), and
  **the new state in Dirac notation** with the probability of each outcome.

Amplitudes are written exactly when they are simple (1/√2, i/2, √3/2,
e^{iπ/4}/√2) and as decimals otherwise. The panel shows the same in plain
text. Tests check the matrices (Qiskit qubit order, unitarity, the Toffoli
permutation, projectors), the exact forms and the Dirac strings.

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

## Step debugger

| Stopped at a breakpoint | Stepping onto a measurement |
| --- | --- |
| ![The step debugger stopped at a breakpoint on a GHZ circuit: the pair q0-q1 is no longer entangled on its own because the entanglement spans the whole group](docs/screenshots/step-debugger.png) | ![The debugger on a measured Bell pair: measuring q0 = 1 collapsed the state onto 11, and q0 and q1 are no longer entangled](docs/screenshots/debugger-measure.png) |

**Debug** on the dock (or Shift+D) opens a debugger for the circuit on the orbs.
Step back and forward one gate at a time, set **breakpoints** on timeline steps
(they get a coral border) and **Run** to the next one. For every step it shows
a live histogram of the outcomes at that point, and says in plain words **why the state
changed**: which amplitudes a gate mixed, when two qubits became entangled, and
when a measurement collapsed a partner too. When a pair stops being entangled
because the entanglement spread to a third qubit, it says that rather than
"no longer entangled".

## Big-state views

**View** (Shift+V, or say "next view") cycles three ways to see a state that is
too big for one Bloch sphere each.

| Q-sphere | State city |
| --- | --- |
| ![Q-sphere of a four-qubit state: one dot per basis state, size for probability, colour for phase](docs/screenshots/qsphere.png) | ![State city: the real and imaginary parts of the density matrix as towers](docs/screenshots/state-city.png) |

- **Q-sphere**: one dot per basis state with any weight. All 0s at the top, all
  1s at the bottom, states with the same number of 1s on one latitude. Dot size
  is probability, colour is phase relative to the largest amplitude (a colour
  wheel on the board).
- **State city**: the density matrix as two grids of towers, real and
  imaginary parts. Grey towers on the diagonal are probabilities, blue ones are
  coherences, coral ones hang below the plate when negative. With the noise lab
  on, you watch the blue towers shrink.
- **Entanglement map**: how strongly each pair is entangled (negativity) and
  how entangled each qubit is with all the rest, in gold, with a sentence
  underneath. A GHZ state shows weak pairs but every qubit fully entangled: the
  entanglement belongs to the whole group.

| Two Bell pairs | A four-qubit GHZ state |
| --- | --- |
| ![Entanglement map: two Bell pairs light up q0-q1 and q2-q3, and q4 is on its own](docs/screenshots/heatmap.png) | ![Entanglement map of a GHZ state: no pair is entangled on its own, yet every qubit is fully entangled with the rest](docs/screenshots/heatmap-ghz.png) |

## Voice commands

![The dock after saying "entangle zero and one": the reply shows it heard a CNOT from q0 to q1](docs/screenshots/voice.png)

**Voice** on the dock (or V) listens through the browser's speech recogniser.
It is forgiving about how things are said, and every
command it hears is shown briefly so you know what it understood:

- gates: "Hadamard on qubit two", "X on zero", "S dagger", "rotate qubit zero
  by pi over four around x"
- "entangle zero and one", "CNOT from one to two", "swap one and two"
- "measure qubit one", "measure everything", "run a thousand shots"
- "undo", "redo", "reset", "add a qubit", "next", "show me", "answer two"
- "open the code", "simplify", "zoom", "noise", "library", "debug", "next view"
- rooms: "start a shared lab", "join L K seven Q F", "claim this qubit",
  "assign module three", "classroom", "leave the room"

The grammar is unit tested, including the words recognisers write for numbers
("to", "too", "for", "tree").

## Shared lab

![A shared lab: a Bell pair where q0 belongs to Ana and q1 to you, with the room code on the Share button](docs/screenshots/shared-lab.png)

**Share** opens a room. Everyone in a **shared lab** works on one circuit: a
gate anyone applies, an undo, a rewind or 100 shots shows up for everyone. Late
joiners catch up straight away. Two people can each **hold half of a Bell
pair**: select a qubit and press Share (or say "claim this qubit") and only you
can turn it; its desk label shows your name, and gates on someone else's qubit
are refused with a short note. A two-qubit gate is allowed when one of the
qubits is yours or free, so you can still entangle with a partner. Someone who
joins as a teacher can turn any qubit.

| The room on the 2D page | Someone else's qubit |
| --- | --- |
| ![The share dialog for room LK7QF: a QR code, the link and who is here](docs/screenshots/share-dialog.png) | ![Saying "Hadamard on qubit zero" in a shared lab: q0 belongs to Ana, so the gate is refused](docs/screenshots/shared-refused.png) |

Rooms have a short code (`LK7QF`) and a link with a QR code, so a phone or a
second headset joins by scanning it. Edits that cross are settled the same way
on every device (newest version wins, ties by id), so everyone ends up with the
same circuit.

The relay is built into the dev and preview servers (`/entangled-relay`). For a
static deployment run it anywhere with Node:

```sh
node server/relay.mjs 8787      # then open the app with ?relay=wss://your-host:8787
```

Without a relay, tabs on the same device still share a room.

## Classroom and certificate

| The teacher's panel | A student who has finished |
| --- | --- |
| ![The teacher's class panel: two modules assigned and six students' progress](docs/screenshots/class-dashboard.png) | ![A student's view: the assignment is done and the certificate is on the board](docs/screenshots/student-certificate.png) |

**Start a class** makes the teacher's room (`C7QF2`). The teacher picks course
modules on the class panel and presses **Assign** (or says "assign module
two"). Each student's headset goes straight to the first assigned module they
have not finished, and reports their progress as they go. The panel lists every
student with a bar and where they are ("Module 2, step 3 of 5"), green once they
are done.

When a student finishes their assigned modules (or, on their own, the whole
course) the board shows a **certificate**, and the 2D page can save it as a PNG.

![The certificate: name, modules completed, class and teacher, date, and a seal of two entangled qubits](docs/screenshots/certificate.png)

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
