# Entangled: submission kit

Everything the Devpost form asks for, ready to paste, plus the testing notes and
a shot list for the video. Facts and numbers here match the code on `master`;
check them again after the last change before submitting.

- **Track:** Productivity (a daily learning habit and a creative tool: build,
  code and run quantum circuits with your hands)
- **Division:** New Experience (first commit 23 October 2026, inside the
  competition window)
- **Link for judges:** the GitHub Pages build (see "Publishing" below)
- **Video:** under 3 minutes, on YouTube or Vimeo, public

---

## Tagline (one line)

Hold a qubit in your hand: a hands-first quantum computing lab on your real
desk, five minutes a day.

## Inspiration

Quantum computing is taught on flat screens with arrows and matrices, and most
people bounce off it. But a qubit is a thing with a direction, a phase and a
partner, and our hands understand things like that. We wanted the qubit to be
an object you pick up, turn, touch to another one and watch collapse, on your
own desk, in your own room. Then we wanted a reason to come back every day.

## What it does

Glass orbs on your real table are qubits. Pinch one to pick it up, turn your
wrist to rotate it, touch two together to entangle them (a gold thread appears
between them), make a fist to measure, spread your fingers to fire 100 shots.
Every gesture is a real quantum gate on a real simulated state, and the code
for it (Qiskit, OpenQASM, PennyLane) writes itself beside you.

- **Wind down:** an evening variant, a calm review of known ideas under the
  night sky with soft music and no clock; Today greets you by the time of
  day. Habits tied to the moment: the commute and bedtime.
- **Your crystal:** a glass crystal on your desk grows a shard for every
  idea you learn and a ring for every day you come; it waits grey until
  today's five minutes are done. Growth you can see between sessions.
- **The exponential wall:** add qubits and watch what an ordinary computer
  would need to store the state (2^n numbers, 16 bytes each, exactly): a
  phone, a laptop, a server, then racks of memory lining an aisle that runs
  away from your desk through your room. Around 49 qubits no supercomputer
  has the memory. It is the welcome tour's finale.
- **Today, five minutes a day:** a spaced-repetition session sized for a bus
  ride. Cards you have met come back just before you would forget them; one
  or two new ideas join each day; at least one card asks you to build a state
  with your hands. A streak, a memory board (box by box) and "tomorrow" keep
  the habit going.
- **Learn:** 26 chapters (superposition to the surface code), 21 lessons, a
  course with quizzes, puzzles with par, a daily challenge the same for
  everyone, and a Code Lab where you write OpenQASM 3 on the panel.
- **Play:** 33 items, including quantum tic-tac-toe on a tappable 3D board,
  the double slit, Stern-Gerlach, the Elitzur-Vaidman bomb tester, a spy game
  (BB84), a Grover maze, teleportation booths and Quantum Rush.
- **Real hardware:** the dilution refrigerator, a trapped-ion chamber, a
  neutral-atom array and a photonic chip in 3D, at desk size or full size
  beside you; run your circuit on each and compare.
- **Together:** a shared lab, races with friends, and a classroom with a
  teacher scoreboard.

## How the real room changes it (passthrough with a purpose)

- **The lab sits on your real table.** Plane and mesh detection find a
  table-height surface under your hands and put the orbs on it, at its height,
  where your hands already are. A table behind you or out of seated reach is
  ignored.
- **Your wall is the screen.** In the double slit, "My wall" sends each photon
  across your room to the real wall in front of you. The stripes on a wall
  L metres away are lambda L / d apart, so your room sets the pattern: a wall
  twice as far gives stripes twice as wide. With no wall found, a virtual
  screen stands in.
- **Pin the lab here.** A persistent spatial anchor brings the lab back to
  the same spot in your room next time.
- **Real occlusion.** With depth sensing, your real hand in front of a qubit
  hides it, as it would a real glass ball.

## Seated, hands-first, and quick to get into

- Fully usable with hands end to end; controllers optional.
- Every interaction is within a seated reach (the airplane seat test).
- Autosave and quick resume; Today is a complete moment in about five minutes
  (the bus stop test).
- Field-of-view aware: on a narrow view (Meta VR Glasses) the compact layout
  swings every side panel inside about 31 degrees of straight ahead; Auto picks
  it from the headset's projection.

## Ket, the lab partner (context-aware assistance)

A small companion beside the desk that perceives what you do and the state
it leaves, explains it in a sentence read off the real quantum state, plans
hints by searching for the shortest path from where you are to the goal, and
answers spoken questions ("what just happened?", "what should I do?", "what
is entanglement?"). It points at the orb it is talking about, can read its
words aloud, and runs entirely on the headset.

## Accessibility

- **Look to select:** rest your gaze on any button or orb and a ring fills;
  when it closes, it is pressed. Turned on once in Settings (it stays on), it
  also starts voice by looking at the Voice button, and with voice commands
  for every gate the lab works without hands.
- **Gaze and pinch** on headsets that track eyes (IWSDK gaze tracking).
- **High contrast**, **reduce motion**, **sound captions** (every sound cue
  shown as words) and a left- or right-handed wrist menu.
- Voice for almost everything: "Hadamard on qubit two", "entangle zero and
  one", "settings", "pin the lab", "my five minutes".

## How we built it

Meta's Immersive Web SDK (IWSDK 1.0, three.js, TypeScript, Vite): ECS systems
for the lab, gestures, tossing, gaze and the UI; UIKitML panels in the Horizon
style. The quantum engine (state vectors, density matrices for noise, the
circuit unitary, routing to real chips, OpenQASM and Qiskit export) is our own
and covered by unit tests (`npm test`). The 3D machines are built in code from
merged primitives, one mesh per material, so a whole cryostat is a handful of
draw calls.

## Challenges

- Making gestures that do not collide: a pinch near a panel must grab the orb,
  not poke the panel, so panels stop taking pokes while a hand is near an orb.
- Building and verifying without a headset for most of the time: everything
  was driven and checked in the Immersive Web Emulator, with scripted poses
  and screenshots, and covered by tests.
- Keeping a large lab light enough for Quest: hidden scenes are never drawn,
  machines are merged by material, and repeated parts are instanced.

## What we are proud of

- A qubit you can actually hold, and entanglement you can see.
- Physics that is honest: the double slit stripes on your wall follow
  lambda L / d for your real distance; the bomb tester follows a real
  Mach-Zehnder interferometer; quantum tic-tac-toe follows Goff's rules.
- A daily habit built on spaced repetition, not just streaks.

## What we learned

Hands are a better interface for rotations and phases than any slider, and
"build this state" teaches more than "pick the answer". A five-minute daily
loop matters more than another hour of content.

## What's next, and launch

- Test sessions with students and teachers on Quest 3 and Quest 3S; tune
  gesture thresholds on real hands.
- Shared rooms on a hosted relay, so friends and classes can join from the
  public link.
- A Meta VR Glasses build tuned for the narrower view when the device ships.
- **Target launch:** public WebXR release in January 2027; a Meta VR Glasses
  version with the device launch in spring 2027.

---

## Testing instructions for judges

1. Open the link in the Meta Quest Browser and tap **Enter AR**. Allow hand
   tracking, and allow spatial data if asked (it lets the lab find your
   table and wall).
2. Sit at a table. The lab appears on it (or floating in front of you), and
   the welcome tour starts: five moves to your first Bell pair, with a ghost
   hand showing each one and Ket, the lab partner, saying hello.
3. Pinch an orb, turn your wrist, touch two orbs together, make a fist. Ask
   Ket "what just happened?" at any point.
4. **Play tab, first item: Today.** A complete five-minute session.
5. **Play tab: Double slit, then My wall** to send photons to your wall.
6. **Settings** (nav panel footer): Pin the lab, Look to select, High contrast,
   Field of view.

Known limits of the static hosted build: the shared lab, races and the
classroom need the project's relay server, and running on IBM Quantum needs
its proxy; both run with `npm run dev`. Everything else works from the link.

## Publishing (do this before submitting)

1. Make the repository public, or give the judges a public mirror of the build.
   GitHub Pages on a private repository needs a paid GitHub plan.
2. Settings > Pages > Source: **GitHub Actions**.
3. Actions > **Deploy to GitHub Pages** > Run workflow. It runs the tests,
   builds, and prints the link.
4. Open the link on a Quest and run through the testing steps above.

## Video: a B-roll cut to start from

`entangled-demo-broll.mp4` (in the project folder next to the repository, not
committed) is about 90 seconds of real emulator footage, edited: a title card,
twelve captioned shots in story order (first launch, superposition,
entanglement with Ket explaining, measurement, 100 shots, Today, Ket's hint,
the double slit on the wall, look to select, quantum tic-tac-toe, the bomb
tester, the full-size machine) and an end card, over a quiet synthesized
pad. Record a voice-over following the "Say" column below, replace the pad
with it (or keep the pad low under your voice), and add Quest footage if you
can borrow a headset. It is real gameplay, as the rules ask.

## Video shot list (under 3:00)

Record on a Quest if one can be borrowed (Quest casting or the built-in
recorder), otherwise in the Immersive Web Emulator. Real footage only.

| Time | Shot | Say |
| --- | --- | --- |
| 0:00 | A hand pinches a glass orb off a real table; it turns with the wrist | "This is a qubit. You can hold it." |
| 0:12 | Touch two orbs: the gold thread; fist: both collapse together | "Touch two and they are entangled. Measure one, and its partner answers." |
| 0:30 | The code window writing Qiskit as you move | "Every gesture is a real gate, and the code writes itself." |
| 0:45 | Play, Today: a make-this-state card, a quiz, Done for today | "Five minutes a day. Cards come back just before you forget them." |
| 1:10 | The memory board, the streak, tomorrow | "A reason to come back tomorrow." |
| 1:20 | Double slit, My wall: photons crossing the room, stripes on the wall | "Your room is part of the experiment: your wall is the screen." |
| 1:45 | Quantum tic-tac-toe, the bomb tester | "Games where the rules are quantum." |
| 2:05 | Look to select filling on a button; high contrast; compact layout | "No hands needed: look to select, voice for every gate." |
| 2:25 | The fridge at full size beside the desk | "And the machines that run it, at real size." |
| 2:45 | Title card: Entangled, hold a qubit in your hand | |
