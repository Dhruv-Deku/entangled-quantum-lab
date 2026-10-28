import { DepthSensingSystem, World } from '@iwsdk/core';
import projectOptions from 'virtual:iwsdk-project';
import { TutorSystem } from './game/tutor-system.js';
import { UISystem } from './game/ui-system.js';
import { DebugInputSystem } from './lab/debug-input.js';
import { GestureSystem } from './lab/gesture-system.js';
import { LabSystem } from './lab/lab-system.js';
import { TossSystem } from './lab/toss-system.js';
import { LookSelectSystem } from './lab/look-select.js';

World.create(
  document.getElementById('scene-container') as HTMLDivElement,
  projectOptions,
).then((world) => {
  world.registerSystem(LabSystem);
  world.registerSystem(GestureSystem);
  world.registerSystem(TossSystem);
  world.registerSystem(DebugInputSystem);
  world.registerSystem(UISystem);
  world.registerSystem(TutorSystem);
  world.registerSystem(LookSelectSystem);
  // real-world depth: the orbs are hidden behind your hands and real objects
  world.registerSystem(DepthSensingSystem);
  // the lab is up: fade the splash after its first frames
  const splash = document.getElementById('splash');
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      splash?.classList.add('gone');
      setTimeout(() => splash?.remove(), 700);
    }),
  );
}).catch((err: unknown) => {
  // no WebGL or WebXR here: say so instead of a blank page
  const note = document.querySelector('#splash small');
  if (note) note.textContent = 'Entangled needs a browser with WebGL and WebXR, such as the Meta Quest Browser.';
  document.querySelector('#splash .bar')?.remove();
  console.error(err);
});
