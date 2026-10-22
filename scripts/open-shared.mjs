// Dev helper for `iwsdk browser run`: hand the running app a share link (a GHZ state, then a measurement).
// The managed dev browser resets its address on reload, so this uses a hash change instead.
export default async function run({ page, frame }) {
  const target = frame ?? page;
  await target.evaluate(() => {
    location.hash = '#c=' + encodeURIComponent('3_h0/x1c0/x2c1/M0=1');
  });
  await page.waitForTimeout(1500);
  return { url: target.url(), framed: !!frame && frame !== page.mainFrame() };
}
