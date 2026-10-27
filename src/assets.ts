import { AssetType, defineAssets } from '@iwsdk/core';
import room from './scene-assets/room.scene-asset.js';

const publicAssetUrl = (filePath: string): string =>
  `${import.meta.env.BASE_URL}${filePath.replace(/^\/+/u, '')}`;

export default defineAssets({
  room,
  'chapter-panel': {
    url: publicAssetUrl('ui/chapter.uikitml'),
    type: AssetType.UIKitML,
    name: 'Chapter Panel',
  },
  'code-panel': {
    url: publicAssetUrl('ui/code.uikitml'),
    type: AssetType.UIKitML,
    name: 'Code Panel',
  },
  'nav-panel': {
    url: publicAssetUrl('ui/nav.uikitml'),
    type: AssetType.UIKitML,
    name: 'Navigator',
  },
  'builder-panel': {
    url: publicAssetUrl('ui/builder.uikitml'),
    type: AssetType.UIKitML,
    name: 'Circuit Builder',
  },
  'notes-panel': {
    url: publicAssetUrl('ui/notes.uikitml'),
    type: AssetType.UIKitML,
    name: 'Notes',
  },
  'class-panel': {
    url: publicAssetUrl('ui/class.uikitml'),
    type: AssetType.UIKitML,
    name: 'Classroom',
  },
  'debug-panel': {
    url: publicAssetUrl('ui/debug.uikitml'),
    type: AssetType.UIKitML,
    name: 'Debugger',
  },
  'library-panel': {
    url: publicAssetUrl('ui/library.uikitml'),
    type: AssetType.UIKitML,
    name: 'Library',
  },
  'looks-panel': {
    url: publicAssetUrl('ui/looks.uikitml'),
    type: AssetType.UIKitML,
    name: 'Looks',
  },
  'codelab-panel': {
    url: publicAssetUrl('ui/codelab.uikitml'),
    type: AssetType.UIKitML,
    name: 'Code Lab',
  },
  'decoder-panel': {
    url: publicAssetUrl('ui/decoder.uikitml'),
    type: AssetType.UIKitML,
    name: 'Decoder pad',
  },
  'wrist-panel': {
    url: publicAssetUrl('ui/wrist.uikitml'),
    type: AssetType.UIKitML,
    name: 'Wrist menu',
  },
  'noise-panel': {
    url: publicAssetUrl('ui/noise.uikitml'),
    type: AssetType.UIKitML,
    name: 'Noise lab',
  },
  'gate-dock': {
    url: publicAssetUrl('ui/dock.uikitml'),
    type: AssetType.UIKitML,
    name: 'Gate Dock',
  },
});
