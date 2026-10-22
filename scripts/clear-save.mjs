// Dev helper for `iwsdk browser run`: forget the saved progress so the next load is a first launch.
export default async function run({ page }) {
  await page.evaluate(() => localStorage.clear());
  return { cleared: true };
}
