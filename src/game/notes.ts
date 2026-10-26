/**
 * Notes: the longer, plain-English explanation behind every chapter, lesson
 * and the builder, shown in the Notes panel and read aloud on request.
 * Plain ASCII only: the panel font has no special symbols, so states are
 * written |0>, |+>, square roots as sqrt(2). The last paragraph is always the
 * key idea.
 */

export const NOTES: Record<string, string[]> = {
  // ---------- chapters ----------
  Superposition: [
    'A classical bit is either 0 or 1. A qubit can be in a blend of both at once, written a|0> + b|1>, where a and b are numbers called amplitudes.',
    'The arrow in each orb is the Bloch sphere picture of that blend. Straight up is |0>, straight down is |1>, and every other point is a superposition. The height of the arrow sets the odds: the chance of reading 1 is |b| squared.',
    'Superposition is not ignorance. The qubit is not secretly 0 or 1, waiting to be found out; experiments show that both possibilities really take part until you measure.',
    'When you measure, you only ever get a plain 0 or 1, at random with those odds, and the qubit is left in the state you saw.',
    'Key idea: a qubit carries two amplitudes, but a measurement gives back just one bit.',
  ],
  Interference: [
    'Amplitudes are not probabilities. They can be negative, or even complex, so two paths that lead to the same answer can add up or cancel out, like waves on water.',
    'One Hadamard sends |0> into an even mix of 0 and 1. A second Hadamard splits each half again. The two paths that end at 1 have opposite signs and cancel; the two that end at 0 add up. The result is |0>, with certainty.',
    'That is why two random-looking steps give a completely predictable answer. A coin flipped twice stays random; a qubit split twice comes back.',
    'Every quantum algorithm is built on this: arrange the paths so that wrong answers cancel and the right answer is reinforced.',
    'Key idea: quantum computers compute with interference, not just with randomness.',
  ],
  Entanglement: [
    'Two qubits can share one state that cannot be split into a separate state for each. The pair (|00> + |11>)/sqrt(2), made by H and then CNOT, is the classic example: a Bell state.',
    'Look at either qubit alone and it is perfectly random, which is why its arrow shrinks to nothing. Look at both and they always agree. The information lives in the pair, not in the parts.',
    'Measuring one decides the other at once, however far apart they are. This does not send a message: each side alone still sees random results. The pattern only appears when the two lists are compared.',
    'In this app a gold thread joins entangled pairs, and a gold ring surrounds a group that is entangled together without any single pair carrying it.',
    'Key idea: entanglement is correlation stronger than any classical system can produce.',
  ],
  Teleportation: [
    'Quantum teleportation moves an unknown qubit state from one place to another, using a shared entangled pair and two ordinary bits.',
    'Alice links her message qubit to her half of the pair (a CNOT, then an H) and measures both. She gets two random bits and sends them to Bob over any normal channel.',
    'Depending on those bits, Bob applies X, Z, both or nothing to his qubit, and it becomes the original message exactly. No matter travels; the state does.',
    'Alice\'s qubit ends up measured, so the original is destroyed. That keeps the no-cloning rule intact, and waiting for the two bits keeps it slower than light.',
    'Key idea: one entangled pair plus two bits can carry one qubit. Quantum networks are being built on this.',
  ],
  'Quantum Spy': [
    'BB84, invented in 1984, lets two people grow a secret key whose safety rests on physics rather than on hard mathematics.',
    'Alice sends bits on single photons, each in a randomly chosen basis: straight (0 and 1) or diagonal. Bob measures each photon in his own random basis. Afterwards they compare bases, never bits, and keep only the rounds where the bases matched.',
    'An eavesdropper has to measure to learn anything. Half the time she picks the wrong basis, which changes the photon, so about 25 percent of the kept bits come out wrong. Alice and Bob check a sample: errors mean someone was listening.',
    'Key idea: measuring disturbs a quantum state, so eavesdropping leaves fingerprints. Commercial quantum key distribution systems use this today.',
  ],
  'The Search': [
    'Grover\'s algorithm finds a marked item in an unsorted list of N items in about sqrt(N) steps, instead of the roughly N steps a classical search needs.',
    'Start with an even superposition of every item. The oracle flips the sign of the marked item only; the odds do not change, so nothing seems to happen. The diffusion step then reflects every amplitude about the average, which turns that hidden minus sign into extra probability.',
    'With four items, one round is exactly enough: the marked item comes out every time. With more items you repeat the oracle and diffusion about (pi/4) times sqrt(N). Going further overshoots, so the count matters.',
    'Key idea: interference gives a quadratic speed-up for any search where you can recognise the answer when you see it.',
  ],
  'The Storm': [
    'Real qubits are fragile. Heat, stray fields and imperfect control flip them or scramble their phase, and long computations would drown in that noise without protection.',
    'You cannot copy a qubit as a backup, and you cannot measure it to check it. The bit-flip code avoids both: CNOTs spread a|0> + b|1> into a|000> + b|111>, one entangled state, not three copies.',
    'If one qubit flips, undoing the CNOTs leaves the two helpers pointing at the culprit (11 means q0, 10 means q1, 01 means q2) without revealing a or b. A Toffoli then fixes q0 exactly when both helpers say so.',
    'Key idea: errors can be found and fixed without looking at the data. Full codes also catch phase errors, and the surface codes in today\'s machines build on the same idea.',
  ],
  'Two Bits, One Qubit': [
    'Superdense coding is the mirror image of teleportation: one qubit carries two classical bits, as long as the sender and receiver already share an entangled pair.',
    'Alice applies one of four operations to her half: nothing, X, Z, or X and then Z. Each one turns the pair into a different one of the four Bell states, and those four can be told apart perfectly.',
    'She sends her single qubit to Bob. He undoes the entanglement with a CNOT and an H, and the two qubits now read the two bits with certainty.',
    'Key idea: entanglement is a resource. Shared in advance, it doubles what a quantum channel can carry.',
  ],
  'One Question': [
    'Deutsch\'s problem: a sealed box computes a function f of one bit. Is f constant (the same output for 0 and 1) or balanced (different outputs)? Classically you have to try both inputs.',
    'Put the input in superposition and the output qubit in the minus state |->. One question then writes a minus sign into the phase of every input where f gives 1. This is phase kickback: the answer leaves the output alone and lands in the input\'s phase.',
    'A final H turns that phase into a definite bit: 0 for constant, 1 for balanced, with no randomness at all.',
    'Key idea: one question instead of two. Deutsch\'s 1985 idea was the first sign that a quantum computer can beat every classical one at some task.',
  ],
  'Hidden Number': [
    'A box hides a secret string of n bits, s. Asked about an input x, it answers one bit: the parity of the positions where both x and s have a 1. Each classical question reveals at most one bit of s, so you need n questions.',
    'Prepare the helper in |-> and the inputs in an even superposition. One question kicks a minus sign into exactly the input qubits where s has a 1.',
    'Hadamards on the inputs turn those signs straight into the bits of s. One question reads the whole string: 3 bits here, but it works the same for a million.',
    'Key idea: n questions become one. The same pattern of superposition, phase kickback and interference sits inside bigger algorithms, including Simon\'s and Shor\'s.',
  ],
  'Max Cut': [
    'MaxCut: split the nodes of a graph into two groups so that as many edges as possible run between them. It stands in for many scheduling and layout problems, and for big graphs no fast exact method is known.',
    'As a cost Hamiltonian, H_C = sum over edges of 1/2 (Z_i Z_j - 1). Each split is a basis state whose energy is minus the number of edges it cuts, so the ground state is the best cut.',
    'QAOA starts in |+> on every qubit, then alternates exp(-i gamma H_C) (CNOT, Rz, CNOT per edge) with exp(-i beta X) on each qubit (Rx). A classical optimizer tunes gamma and beta to lower <H_C>.',
    'The approximation ratio <H_C> / min(H_C) scores the average shot: one layer on a ring of four reaches 0.75, two layers do better. The PennyLane tab exports the same circuit with qml.qaoa.',
    'Key idea: a variational algorithm is a loop. The quantum circuit estimates a cost, a classical computer turns the dials, and the two together find good answers.',
  ],
  'Phase Wheel': [
    'The quantum Fourier transform maps a number x to angles: |x> becomes 1/sqrt(N) times the sum over y of e^(2 pi i x y / N) |y>. Every output qubit ends up on the equator, turned by an angle that encodes x.',
    'For 3 qubits, qubit k turns by x times 2^k / 8 of a full turn: q0 by x/8, q1 by twice that, q2 by four times. The circuit is Hadamards and controlled phase gates, then swaps; it needs about n^2 gates for n qubits, against n 2^n for the classical fast Fourier transform.',
    'The angles cannot be read by one measurement, which is why the QFT is used in reverse: the inverse QFT turns angles back into a number you can measure. In Qiskit: from qiskit.circuit.library import QFTGate.',
    'Key idea: the QFT writes numbers as phases and the inverse reads phases as numbers. Phase estimation and Shor are built on it.',
  ],
  'Phase Estimation': [
    'If |u> is an eigenstate of a gate U, then U|u> = e^(2 pi i phi)|u> for some phase phi. Phase estimation measures phi.',
    'Counting qubit j controls U applied 2^j times. Because |u> is an eigenstate, the target is unchanged and the phase kicks back onto the control: qubit j picks up 2 pi phi 2^j. That is exactly the pattern a QFT makes, so an inverse QFT reads phi in binary.',
    'With m counting qubits phi is read to m bits; here 3 bits read any multiple of 1/8 exactly. Finer phases need more qubits, and the error falls by half with each one.',
    'Key idea: phase kickback plus the inverse QFT reads an eigenvalue. It powers Shor\'s algorithm and quantum chemistry.',
  ],
  'Factoring 15': [
    'To factor N, pick a number a and find the period r of a^x mod N. For N = 15 and a = 7 the powers go 1, 7, 4, 13, then repeat, so r = 4. Then a^(r/2) = 49 = 4 (mod 15), and gcd(4 - 1, 15) = 3 and gcd(4 + 1, 15) = 5 are the factors.',
    'The quantum part finds r: a superposition of every x, the function a^x mod N computed into a work register, and an inverse QFT that turns the period into peaks at multiples of 2^m / r.',
    'Here the modular exponent is compiled: knowing the period is 4, two CNOTs copy the right bits. A full circuit computes a^x mod N with reversible arithmetic and needs many more qubits; factoring a 2048-bit RSA number would take millions of physical qubits with error correction.',
    'Key idea: factoring becomes period finding, and the QFT finds periods exponentially faster than any known classical method.',
  ],
  'The H2 Molecule': [
    'A molecule\'s electronic energy is the lowest eigenvalue of its Hamiltonian. Mapped to qubits (Jordan-Wigner, STO-3G basis), H2 needs 4 qubits and 15 Pauli terms like Z0 Z1 and X0 X1 Y2 Y3, with coefficients that change with the bond length.',
    'VQE prepares a trial state with a circuit that has dials, measures the energy term by term, and lets a classical optimizer turn the dials down. Here one dial mixes the Hartree-Fock state |1100> with the doubly excited |0011>, which is all H2 needs.',
    'Hartree-Fock misses electron correlation: 0.0205 hartree at 0.74 Angstrom, and much more when the bond is stretched. VQE recovers it. The Hamiltonians were computed with PennyLane qchem (qml.qchem.molecular_hamiltonian).',
    'Key idea: VQE is a quantum-classical loop for finding ground-state energies, one of the most promising early uses of quantum computers.',
  ],
  'Search 8 Boxes': [
    'Grover\'s search finds one marked item among N in about (pi/4) sqrt(N) steps, where checking one by one takes N/2 on average.',
    'Each round has two parts. The oracle flips the sign of the marked item\'s amplitude. The diffuser reflects every amplitude about the average, which grows the marked one and shrinks the rest.',
    'For 8 items: 1/8 at the start, 78% after one round, 94.5% after two. A third round would overshoot and lower it again, so knowing when to stop matters.',
    'Key idea: amplitude amplification gives a square-root speedup for unstructured search, and it is used inside many other quantum algorithms.',
  ],
  "Simon's Secret": [
    'A box computes f(x) with a hidden rule: f(x) = f(x xor s) for a secret bit string s. Classically you need about 2^(n/2) questions to find s; Simon\'s algorithm needs about n.',
    'Query the box on a superposition of every input, then apply Hadamards to the inputs. Interference cancels every outcome y with an odd overlap with s, so each shot gives a y with y . s = 0 (mod 2).',
    'A few such readings form linear equations whose only non-zero solution is s. With 2 bits, one or two readings already pin it down.',
    'Key idea: Simon\'s algorithm was the first exponential quantum speedup over classical computers, and it inspired Shor\'s factoring.',
  ],
  'The Mystery Qubit': [
    'One copy of a qubit tells you almost nothing: a measurement gives a single bit and destroys the rest, and an unknown qubit cannot be copied. But if a machine can make the same state again and again, many measurements can rebuild it.',
    'Measuring along Z gives P(0) = (1 + z)/2, so z = P(0) - P(1). To measure along X, first apply H, which swings the X axis onto Z. For Y, apply S dagger and then H. Three axes give the three numbers of the arrow: x, y and z.',
    'With 100 copies per axis each number is off by about 0.1, so your rebuilt arrow lands close to the real one but not on it. Four times the copies halves the error. Qiskit does this with StateTomography in qiskit_experiments.',
    'Key idea: one copy tells you almost nothing, many copies tell you everything. Tomography is how labs check every new qubit and gate they build.',
  ],

  // ---------- lessons ----------
  Hadamard: [
    'H is the gate of superposition. It turns |0> into |+> = (|0> + |1>)/sqrt(2), and |1> into |-> = (|0> - |1>)/sqrt(2).',
    'On the sphere it is a half turn about the axis halfway between X and Z, which swaps the top and the front. Applied twice it does nothing: H is its own inverse.',
    'Matrix: (1/sqrt(2)) [[1, 1], [1, -1]]. In Qiskit: qc.h(0).',
    'Key idea: H moves a qubit between the 0/1 basis and the +/- basis. Almost every algorithm starts and ends with it.',
  ],
  'X gate': [
    'X is the quantum NOT: |0> becomes |1> and |1> becomes |0>.',
    'On the sphere it is a half turn about the X axis, the one pointing toward you. A state on that axis, such as |+>, does not move at all.',
    'Matrix: [[0, 1], [1, 0]]. In Qiskit: qc.x(0).',
    'Key idea: X is the bit flip. Add a control and it becomes the CNOT, the main way qubits interact.',
  ],
  'Y gate': [
    'Y is a half turn about the Y axis, the one pointing to the side. Like X it swaps 0 and 1, but it also multiplies by i or -i.',
    'Starting from |0>, X and Y give the same odds, so a measurement cannot tell them apart. The difference shows up only when that phase interferes with something else.',
    'Matrix: [[0, -i], [i, 0]]. In Qiskit: qc.y(0).',
    'Key idea: X, Y and Z are the Pauli gates, the three half turns. Any single-qubit error can be written in terms of them.',
  ],
  'Z gate': [
    'Z leaves |0> alone and flips the sign of |1>: a|0> + b|1> becomes a|0> - b|1>.',
    'On the sphere it is a half turn about the vertical axis, so |+> swings round to |->. The odds of 0 and 1 never change.',
    'Matrix: [[1, 0], [0, -1]]. Also, Z = H X H: the builder\'s first challenge.',
    'Key idea: Z is the phase flip. Invisible to a direct measurement, decisive once paths interfere.',
  ],
  'S gate': [
    'S is a quarter turn about the vertical axis: it multiplies the |1> part by i. Two S gates make a Z.',
    'From |+> it turns the arrow to the side, to the state |+i>, which needs a complex amplitude to write down.',
    'Matrix: [[1, 0], [0, i]]. Its inverse is S dagger, called sdg in Qiskit.',
    'Key idea: S is a gentler Z. With H and CNOT it makes up the Clifford gates, which an ordinary computer can still simulate efficiently.',
  ],
  'T gate': [
    'T is an eighth turn about the vertical axis: it multiplies |1> by e to the power i pi/4. Two T gates make an S, and four make a Z.',
    'H, S and CNOT alone can be simulated efficiently on a normal computer. Adding T makes the set universal: together they can approximate any quantum computation.',
    'Matrix: [[1, 0], [0, e^(i pi/4)]]. Its inverse is T dagger, called tdg in Qiskit.',
    'Key idea: T gates are the expensive ingredient in error-corrected machines, so researchers count them carefully.',
  ],
  Rotation: [
    'Ry(theta) turns the arrow by any angle theta about the side axis. Turning your wrist applies exactly this gate.',
    'Starting from |0>, the chance of reading 1 is sin squared of theta/2. A 60 degree turn gives only 25 percent, and 90 degrees gives 50: probability grows with the square of the amplitude, not with the angle.',
    'Rx and Rz turn about the other two axes. Every single-qubit gate is a combination of these rotations, up to a global phase.',
    'Key idea: gates are rotations of the sphere, and continuous angles let a quantum computer tune states finely.',
  ],
  Measurement: [
    'Measuring a qubit gives 0 with probability |a| squared and 1 with probability |b| squared. This is the Born rule.',
    'Afterwards the qubit is in the state you saw, and the superposition is gone. Measuring again gives the same answer.',
    'One measurement cannot reveal the amplitudes. To estimate them you prepare the same state many times and count the results, which is what 100 shots does.',
    'Key idea: measurement is the only way out of a quantum computer, so algorithms try to put nearly all the probability on the right answer first.',
  ],
  CNOT: [
    'CNOT flips the target qubit if and only if the control is 1: |10> becomes |11>, |11> becomes |10>, and |00> and |01> stay put.',
    'In circuit diagrams it is a dot on the control wire joined to a circled plus on the target. In Qiskit: qc.cx(0, 1).',
    'Give it a control in superposition and it creates entanglement: H and then CNOT turn |00> into a Bell pair.',
    'Key idea: CNOT plus single-qubit gates is enough to build any quantum circuit.',
  ],
  SWAP: [
    'SWAP exchanges the states of two qubits: |01> becomes |10>. Doing it twice changes nothing.',
    'Three CNOTs in a row, alternating direction, do the same job. It is the same trick as swapping two numbers with XOR.',
    'Real chips only connect neighbouring qubits, so compilers insert SWAPs to bring distant qubits together, and every one costs time and adds noise.',
    'Key idea: moving quantum information around is part of the real cost of running a circuit.',
  ],
  Phase: [
    'Every amplitude has a size and a phase, which is an angle. The size sets the odds; the phase is invisible to a straight measurement.',
    'On the Bloch sphere the phase is the direction around the equator. |+> and |-> have the same odds but opposite phase.',
    'Phase matters the moment paths combine. H turns |+> into |0> and |-> into |1>: a hidden sign becomes a certain answer.',
    'Key idea: algorithms hide answers in phases, then use interference to bring them out. A single global phase on the whole state, though, never matters.',
  ],
  Kickback: [
    'A controlled gate can change its control instead of its target. If the target is in a state the gate only multiplies by a number, the target stays put and that number lands on the control.',
    'Here the target is |->, and X turns |-> into -|->. So the CNOT multiplies the control\'s |1> part by -1, turning |+> into |->.',
    'This phase kickback is how an oracle reports an answer without disturbing its output wire.',
    'Key idea: kickback is the engine of Deutsch, Bernstein-Vazirani, Grover and phase estimation, and through that, of Shor\'s algorithm.',
  ],
  'No cloning': [
    'The no-cloning theorem says no process can copy an unknown quantum state. There is no quantum photocopier.',
    'A CNOT copies 0 and 1 perfectly, so it looks like a copier. But fed a|0> + b|1>, it makes a|00> + b|11>, an entangled pair, not two copies of the original.',
    'The reason is that quantum mechanics is linear: a machine that copied 0 and 1 correctly has to get their superpositions wrong.',
    'Key idea: no-cloning protects quantum keys from eavesdroppers, and it is why error correction has to work without copying.',
  ],
  'Bell states': [
    'There are four maximally entangled two-qubit states, the Bell states: (|00> + |11>)/sqrt(2), (|00> - |11>)/sqrt(2), (|01> + |10>)/sqrt(2) and (|01> - |10>)/sqrt(2).',
    'H and CNOT make each one from one of the four inputs |00>, |01>, |10> and |11>. A Pauli gate on one qubit turns any of them into any other.',
    'Running the circuit backwards, CNOT and then H, turns them back into plain bits. That is how superdense coding and teleportation read them.',
    'Key idea: Bell states are the basic unit of entanglement, sometimes called ebits.',
  ],
  'GHZ state': [
    'The GHZ state (|000> + |111>)/sqrt(2) ties three qubits together: measure any one and you know the other two.',
    'Yet no pair is entangled by itself. Lose one qubit and the other two are only classically correlated. The entanglement belongs to the whole group, which is why this app draws a ring instead of threads.',
    'GHZ states give some of the sharpest tests of quantum theory, and they are used in quantum sensing and error correction.',
    'Key idea: entanglement can belong to a group, not just to pairs.',
  ],

  // ---------- advanced chapters ----------
  'Bell Test': [
    'In the CHSH game a referee sends Alice and Bob a random bit each. They answer with one bit each, without talking, and win when their answers differ exactly when both questions were 1.',
    'Any plan made in advance, even with shared random numbers, wins at most 75% of rounds. In terms of the score S = E1 + E2 + E3 - E4, built from how often their answers agree, that is S <= 2: Bell\'s inequality.',
    'With a Bell pair, Alice measures at 0 or 90 degrees and Bob at 45 or -45, depending on their questions. Their answers agree with probability cos^2 of half the angle between them, and they win cos^2(22.5 degrees), about 85%: S = 2 sqrt(2), the most quantum mechanics allows (Tsirelson\'s bound).',
    'Measure one qubit first and the pair becomes ordinary correlated bits: the score falls back under 2.',
    'Key idea: no hidden list of answers can explain entanglement. Experiments that closed every loophole won the 2022 Nobel Prize in Physics.',
  ],
  'Error Correction': [
    'Noise flips qubits. Classical computers copy bits and take a vote, but a qubit cannot be copied, and reading it destroys it.',
    'The bit-flip code spreads a|0> + b|1> into a|000> + b|111> with two CNOTs. That is entanglement, not copying: there are still only two numbers, a and b.',
    'Two extra qubits measure parities: is q0 the same as q1, and q1 the same as q2? The answers (the syndrome) say which qubit flipped, and say nothing about a or b, so the message survives the measurement.',
    'If each qubit flips with chance p, the code fails only when two or three flip: 3p^2 - 2p^3. That beats p whenever p < 1/2, the break-even point of this code.',
    'Key idea: measure the errors, never the data. Codes like the surface code catch phase flips too and reach much better thresholds by using many qubits.',
  ],
  'Minus state': [
    '|-> = (|0> - |1>)/sqrt(2) sits at the back of the equator, opposite |+>. Both give 0 or 1 half the time when measured.',
    'The difference is the relative sign, a phase of pi. An H turns |+> into |0> and |-> into |1>, so the sign becomes a definite answer.',
    'Key idea: phase is invisible to a single measurement but changes what later gates do.',
  ],
  'The +i state': [
    '|+i> = (|0> + i|1>)/sqrt(2) points along the third axis of the sphere. H takes |0> to |+>, and S (a quarter turn about the vertical) takes |+> on to |+i>.',
    'Phase gates turn the arrow around the vertical axis: Z by a half turn, S by a quarter, T by an eighth.',
    'Key idea: the six poles 0, 1, +, -, +i and -i are the states the Clifford gates move between.',
  ],
  'Phi minus': [
    'The four Bell states are (|00> +- |11>)/sqrt(2) and (|01> +- |10>)/sqrt(2). Phi minus is the first with a minus sign.',
    'H then Z on q0 gives |->; a CNOT then copies its 0/1 onto q1, carrying the sign along: |00> - |11>.',
    'Key idea: shots cannot tell Phi plus from Phi minus; a CNOT then an H on the control maps each Bell state to its own pair of bits, the Bell measurement used in teleportation.',
  ],
  'All at once': [
    'H on each of n qubits gives every n-bit string with amplitude 1/sqrt(2^n): with three qubits, all eight from 000 to 111.',
    'It takes n gates to prepare 2^n amplitudes, which is why a uniform superposition starts Grover search, Deutsch-Jozsa and the QFT.',
    'Key idea: holding all answers is not the speed-up by itself; measuring would just pick one at random. The job of an algorithm is to make the right one add up.',
  ],
  'Welcome tour': [
    'A qubit is drawn as an arrow in a glass ball (the Bloch sphere). Straight up is 0, straight down is 1, anywhere else is a mix: the higher the arrow, the likelier 0.',
    'Turning the arrow is a gate. H, the Hadamard, lays it on the equator: an even mix of 0 and 1, a superposition.',
    'Measuring makes the qubit pick 0 or 1 at random, with those odds, and it stays there. That is the one move you cannot take back.',
    'Two qubits can be entangled: then neither has a state of its own, only the pair does. H then CNOT makes a Bell pair that always reads 00 or 11.',
    'Key idea: superposition, measurement and entanglement are the three ideas everything else in quantum computing is built from.',
  ],
  'Surface Code': [
    'The surface code stores one logical qubit in a d x d grid of data qubits. Between them sit d^2 - 1 measure qubits, each checking the parity of its two or four neighbours, over and over.',
    'Z checks catch bit flips and X checks catch phase flips. An error lights the checks next to it. The checks only see parities, so they reveal where errors are and nothing about the logical state.',
    'A decoder pairs the lit checks along the shortest paths (minimum-weight matching) and flips those qubits back. It fails only when the real errors and its guess together stretch right across the grid: a logical error.',
    'Below a threshold error rate, a bigger grid makes logical errors exponentially rarer; above it, bigger is worse. With noise only on the data qubits the threshold is about 10%; counting errors in the measurements too, about 1%.',
    'In 2024 Google ran distance 3, 5 and 7 codes on its Willow chip (up to 101 qubits) and each step halved the logical error rate: the first logical qubit that gets better as it grows.',
    'Key idea: many noisy qubits, checked continuously, make one qubit that is better than any of them.',
  ],
  'Entanglement Swapping': [
    'Start with two Bell pairs: q0-q1 and q2-q3. Alice holds q1 and q2; q0 and q3 are far apart and have never met.',
    'Alice measures her two qubits in the Bell basis: a CNOT, an H, and two measurements. This is the same move as in teleportation.',
    'Afterwards q0 and q3 are entangled with each other. Depending on Alice\'s two bits, the person holding q3 applies X, Z, both or nothing to get exactly (|00> + |11>)/sqrt(2).',
    'Only two classical bits travel. Without them, q0 and q3 look like coin tosses that happen to be correlated in one of four unknown ways.',
    'Key idea: entanglement can be passed along a chain, which is how quantum repeaters will build long-distance quantum links.',
  ],
  'Quantum Walk': [
    'A classical random walker flips a coin each step and moves left or right. After t steps it is typically about sqrt(t) sites from the start.',
    'A quantum walker uses a qubit as its coin. A Hadamard tosses it, and a controlled shift moves the walker left and right at the same time.',
    'The paths interfere. Paths back toward the start cancel, so the walker spreads in proportion to t, with peaks far from the middle.',
    'Here q0 to q3 hold the position (16 sites) and q4 is the coin. The coin starts in (|0> + i|1>)/sqrt(2) so the walk is symmetric.',
    'Key idea: quantum walks spread quadratically faster than random walks, and several quantum search algorithms are built on them.',
  ],
  'Time Evolution': [
    'A Hamiltonian H says how a system changes: the state after time t is e^(-iHt) applied to the start. Here H describes three magnetic spins in a line.',
    'The ZZ terms pull neighbours into line; the X terms are a sideways field that tips them. Starting all up, the average magnetisation swings down and back.',
    'A quantum computer cannot apply e^(-iHt) in one go, so it splits time into small steps and applies each part of H in turn: the Trotter method. Each ZZ coupling is CX, RZ, CX; each field term is an RX.',
    'Smaller steps follow the exact curve more closely but need more gates. On real hardware every gate adds noise, so choosing the step size is a balance.',
    'Key idea: simulating quantum systems is the use Feynman had in mind for quantum computers, and it is still among the most promising.',
  ],

  'Quantum Zeno': [
    'Turn a qubit from |0> toward |1> in N small slices. Unwatched, the slices add up and it arrives at |1>.',
    'Look after each slice instead. A slice of angle theta only gives a sin^2(theta/2) chance of finding |1>, and a look that finds |0> puts the qubit back at the start.',
    'With N looks the chance it never moves is cos^2(90 degrees / N)^N, which goes to 1 as N grows: 25% for 2 looks, 78% for 10, 95% for 50.',
    'This is the quantum Zeno effect, named after the paradox of the arrow that never moves because at every instant it is at rest.',
    'Key idea: measurement is not passive. Looking often enough can freeze a quantum system in place.',
  ],
  Benchmarking: [
    'Gate errors are tiny, around 0.1% or less, so one gate is too small to measure directly. Randomized benchmarking runs long random sequences instead.',
    'Each sequence is m random Clifford gates (combinations of H and S) followed by the single Clifford that undoes them all. With perfect gates the qubit always returns to |0>.',
    'With noisy gates the chance of returning falls as A p^m + 1/2. The decay p gives the average error per Clifford, (1 - p)/2, and dividing by the gates per Clifford gives the error per gate.',
    'Errors in preparing and reading the qubit only change A, not p, so the result measures the gates alone.',
    'Key idea: averaging over random sequences turns a tiny, hard-to-see error into a clear curve. It is the standard way chips report gate quality.',
  ],

  // ---------- builder ----------
  'Circuit diagrams': [
    'A circuit diagram reads left to right like music: one horizontal wire per qubit, and time flowing to the right. Each box on a wire is a single-qubit gate.',
    'A filled dot is a control: the gates in the same column act only when that qubit is 1. A dot joined to a circled plus is a CNOT; two dots and a plus make a Toffoli. An open dot is a control that reacts to 0 instead.',
    'Two small crosses joined by a line are a SWAP. Add a dot and you get a Fredkin, a controlled swap.',
    'The builder checks your circuit as a whole gate: it must act the same as the target on every possible input. Only a global phase, which no experiment can detect, is ignored.',
    'Key idea: every circuit is a recipe. The same gate can be cooked from many recipes, and finding short ones is a real research problem called circuit synthesis.',
  ],
};

/** Notes for a chapter, lesson or the builder, by title. */
export function notesFor(title: string | null | undefined): string[] | null {
  return (title && NOTES[title]) || null;
}

const SAY: Record<string, string> = { '0': 'zero', '1': 'one', '+': 'plus', '-': 'minus', i: 'i' };

/** Text a speech engine can read: |01> becomes "zero one", sqrt(2) becomes "root two". */
export function speakable(text: string): string {
  return text
    .replace(/\|([01+\-i]+)>/g, (_, s: string) => ` ${[...s].map((c) => SAY[c] ?? c).join(' ')} `)
    .replace(/sqrt\(([^)]+)\)/g, 'root $1')
    .replace(/\[\[[^\]]*\](?:, \[[^\]]*\])*\]/g, 'the matrix shown')
    .replace(/qc\.\w+\([^)]*\)/g, 'the Qiskit call shown')
    .replace(/\s+/g, ' ')
    .trim();
}
