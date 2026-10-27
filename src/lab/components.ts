import { createComponent, Types } from '@iwsdk/core';

/** A qubit orb on the desk; `index` is its qubit number in the lab register. */
export const Qubit = createComponent('Qubit', {
  index: { type: Types.Int8, default: 0, min: 0, max: 9 },
});

/** The virtual room, shown only when there is no passthrough (desktop and VR). */
export const VirtualRoom = createComponent('VirtualRoom', {});

/** A square of the quantum tic-tac-toe board (tap it by ray or poke). */
export const BoardCell = createComponent('BoardCell', {
  index: { type: Types.Int8, default: 0, min: 0, max: 8 },
});
