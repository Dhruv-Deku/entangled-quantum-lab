# TODO

Deadline Nov 18, 2026 (ours: Nov 17). Feature freeze Nov 14. Cut from the bottom, never ship a broken core.

## Week 1 (Oct 22–28)
- [x] Scaffold IWSDK + TypeScript + Vite project
- [x] Quantum engine: state, gates, measure, Bloch, entanglement, noise, history, export, algorithms
- [x] All required physics tests passing (24 tests; 57 in total with gestures and chapters)
- [x] Configure for seated hands-first play: AR passthrough, hand tracking, no locomotion
- [x] Remove starter robot and panel
- [x] Desktop debug mode: a key for every gesture (press ? in the browser)
- [x] Glass orbs with Bloch arrows, grabbable, rotated with the wrist

## Tier 1 — Core
- [x] Gesture engine: pinch-grab, wrist rotate, fist, spread, two-orb touch; thresholds in one config, hysteresis, debounce
- [x] Detector separation tests on synthetic joint data (17 tests, incl. tracking noise)
- [x] Multi-qubit desk (up to 5 orbs), passthrough with virtual-room fallback
- [x] Bloch trails, gold entanglement thread, shrinking arrows, GHZ group ring
- [x] Probability rain (100 shots)
- [x] Timeline with rewind and replay (dock row)
- [x] Autosave and quick resume
- [x] Hands-only menus (poke + ray); poke pauses near orbs so it never steals a grab
- [x] Onboarding: welcome card on first launch, and a ghost hand that demonstrates every gesture on its orb
- [x] Gate dock with poke buttons (H X Y Z S T Ry CNOT SWAP Measure Shots Qiskit)
- [ ] Verify fist / spread / wrist roll on a real Quest (emulator cannot pose fingers)

## Tier 2 — Campaign
- [x] Ch 1 Superposition
- [x] Ch 2 Interference
- [x] Ch 3 Entanglement
- [x] Ch 4 Teleportation (fidelity 1.000 tested for every outcome)
- [x] Ch 5 Quantum Spy (BB84)
- [x] Ch 6 The Search (Grover; the prize moves every run)
- [x] Ch 7 The Storm (bit-flip code; lightning strike, syndrome, Toffoli repair)
- [x] Ch 8 Superdense coding, Ch 9 Deutsch, Ch 10 Bernstein-Vazirani (4 qubits)
- [x] 15 lessons (added SWAP, Kickback, No cloning)
- [x] Gate effects: rotation path arc, gate name label, CNOT spark
- [x] Notes: plain-English explanations for all 10 chapters, 15 lessons and the builder, with read-aloud
- [x] Build tab: cross-dot circuit builder, 10 new tools, 10 unitary-checked challenges up to a Toffoli from two-qubit gates
- [x] Chapter picker (1–7 on the card), finished chapters remembered

## Tier 3 — Power features
- [x] Qiskit export panel (copies to clipboard on desktop); PennyLane in engine
- [x] Sound cues for every action (synthesized; entanglement plays a chord)
- [ ] Continuous quantum sound (state as tone)
- [x] Learn mode: 12 lessons (one per gate or idea) with target arrows and challenges
- [x] Navigator panel: Chapters / Learn / Sandbox, with progress
- [x] Sandbox presets: Bell, GHZ x3/x5, even x4, teleport, Grover
- [x] Puzzles: 12 make-this-state challenges with par and stars
- [x] Circuit board: live circuit diagram and amplitude circles behind the orbs
- [x] Share links: copy a link that opens your circuit in any sandbox
- [ ] Custom gestures, AI tutor (after the competition)

## Ship
- [ ] Volunteer test on a real Quest (Week 2)
- [ ] Hosted build (GitHub Pages or Vercel)
- [ ] Demo video under 3 minutes, Devpost write-up, README with gesture table
