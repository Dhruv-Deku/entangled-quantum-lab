import { World } from '@iwsdk/core';
import projectOptions from 'virtual:iwsdk-project';
import { TutorSystem } from './game/tutor-system.js';
import { UISystem } from './game/ui-system.js';
import { DebugInputSystem } from './lab/debug-input.js';
import { GestureSystem } from './lab/gesture-system.js';
import { LabSystem } from './lab/lab-system.js';

World.create(
  document.getElementById('scene-container') as HTMLDivElement,
  projectOptions,
).then((world) => {
  world.registerSystem(LabSystem);
  world.registerSystem(GestureSystem);
  world.registerSystem(DebugInputSystem);
  world.registerSystem(UISystem);
  world.registerSystem(TutorSystem);
});
