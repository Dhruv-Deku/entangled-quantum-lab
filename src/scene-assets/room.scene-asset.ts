import {
  BoxGeometry,
  CanvasTexture,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  SRGBColorSpace,
} from '@iwsdk/core';

/** Canvas helper: draw once, use as a texture. */
function paint(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/** Back wall: lighter where the lamp would hit it, falling off to the corners. */
const wallTexture = () =>
  paint(512, 256, (g) => {
    const r = g.createRadialGradient(256, 150, 10, 256, 150, 300);
    r.addColorStop(0, '#2f323b');
    r.addColorStop(0.5, '#22242a');
    r.addColorStop(1, '#16171b');
    g.fillStyle = r;
    g.fillRect(0, 0, 512, 256);
    // dither, so the dark gradient does not band
    const img = g.getImageData(0, 0, 512, 256);
    for (let i = 0; i < img.data.length; i += 4) {
      const n = (Math.random() - 0.5) * 3;
      img.data[i] += n;
      img.data[i + 1] += n;
      img.data[i + 2] += n;
    }
    g.putImageData(img, 0, 0);
  });

/** Felt work mat: rounded, with a faint stitched edge so the workspace has a home. */
const matTexture = () =>
  paint(1024, 640, (g) => {
    const rr = (x: number, y: number, w: number, h: number, r: number) => {
      g.beginPath();
      g.moveTo(x + r, y);
      g.arcTo(x + w, y, x + w, y + h, r);
      g.arcTo(x + w, y + h, x, y + h, r);
      g.arcTo(x, y + h, x, y, r);
      g.arcTo(x, y, x + w, y, r);
      g.closePath();
    };
    rr(8, 8, 1008, 624, 90);
    const fill = g.createRadialGradient(512, 300, 40, 512, 320, 620);
    fill.addColorStop(0, '#34363d');
    fill.addColorStop(1, '#25262b');
    g.fillStyle = fill;
    g.fill();
    // felt grain
    g.save();
    g.clip();
    for (let i = 0; i < 9000; i++) {
      g.fillStyle = Math.random() < 0.5 ? 'rgba(255,255,255,0.018)' : 'rgba(0,0,0,0.03)';
      g.fillRect(Math.random() * 1024, Math.random() * 640, 2, 2);
    }
    g.restore();
    g.setLineDash([10, 9]);
    g.lineWidth = 2;
    g.strokeStyle = 'rgba(255,255,255,0.07)';
    rr(30, 30, 964, 580, 70);
    g.stroke();
  });

/**
 * Calm virtual room for when passthrough is not available: a dark desk with a
 * felt work mat, floor and back wall. Origin on the floor; desk top at y = 0.74,
 * centred at z = -0.42.
 */
export function createRoom(): Group {
  const room = new Group();
  room.name = 'Room';
  const deskMat = new MeshStandardMaterial({ color: '#1c1d21', roughness: 0.42, metalness: 0.05 });
  const desk = new Mesh(new BoxGeometry(1.6, 0.035, 0.85), deskMat);
  desk.position.set(0, 0.74 - 0.0175, -0.42);
  desk.name = 'Desk';
  // a thin lighter front edge catches the key light, so the desk reads as an object
  const edge = new Mesh(new BoxGeometry(1.6, 0.004, 0.006), new MeshStandardMaterial({ color: '#3a3c43', roughness: 0.3 }));
  edge.position.set(0, 0.74 - 0.002, -0.42 + 0.425);
  const mat = new Mesh(
    new PlaneGeometry(0.78, 0.46),
    new MeshStandardMaterial({ map: matTexture(), transparent: true, roughness: 0.95, metalness: 0 }),
  );
  mat.rotation.x = -Math.PI / 2;
  mat.position.set(0, 0.7405, -0.4);
  mat.name = 'Mat';
  const floor = new Mesh(new PlaneGeometry(10, 10), new MeshStandardMaterial({ color: '#0e0f11', roughness: 0.95 }));
  floor.rotation.x = -Math.PI / 2;
  floor.name = 'Floor';
  const wall = new Mesh(new PlaneGeometry(10, 5), new MeshBasicMaterial({ map: wallTexture() }));
  wall.position.set(0, 2, -2.4);
  wall.name = 'Wall';
  room.add(desk, edge, mat, floor, wall);
  return room;
}

export default createRoom();
