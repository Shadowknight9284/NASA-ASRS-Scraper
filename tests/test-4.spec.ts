// tests/asrs-to-drive.spec.ts
import { test, expect, chromium } from '@playwright/test';
import fs   from 'fs';
import path from 'path';
import 'dotenv/config';        

/* ───────────────────────── Local Storage Only ───────────────────────── */
// Google Drive upload disabled due to service account storage limitations
// Files will be saved locally in the test output directory

async function uploadCsv(localPath: string, fileName: string) {
  // Skip Google Drive upload due to service account limitations
  // Files are already saved locally in the downloads folder
  console.log(`💾  Saved ${fileName} locally (Google Drive upload skipped)`);
}

/* ───────────────────────── Playwright test ─────────────────────────── */

test.setTimeout(0);                  // no global limit
const COOLDOWN_MS = 5_000;           // polite 5-second pause
const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December'
];

test('export ASRS CSVs 1988-2024 → Google Drive', async ({}, testInfo) => {
  // a scratch dir inside the Playwright output folder
  const tmpDir = path.join(testInfo.outputDir, 'asrs-tmp');
  fs.mkdirSync(tmpDir, { recursive: true });

  for (let year = 1988; year <= 2024; year++) {
    for (const month of MONTHS) {

      /* 0. fresh browser + context with downloads enabled */
      const browser  = await chromium.launch({ headless: false });
      const context  = await browser.newContext({ acceptDownloads: true });
      const page     = await context.newPage();

      /* 1. build the query (date-range popup) */
      await page.goto('https://akama.arc.nasa.gov/ASRSDBOnline/QueryWizard_Filter.aspx');
      const popup = await Promise.all([
        page.waitForEvent('popup'),
        page.locator('[id="2"]').click()                     // “Specify date range…”
      ]).then(([p]) => p);

      await popup.locator('#DropDownList2').selectOption(month);
      await popup.locator('#DropDownList1').selectOption(String(year));
      await popup.locator('#DropDownList4').selectOption(month);
      await popup.locator('#DropDownList3').selectOption(String(year));
      await popup.getByRole('button', { name: 'Submit' }).click();
      await popup.close();

      /* 2. trigger CSV download */
      await page.goto('https://akama.arc.nasa.gov/ASRSDBOnline/QueryWizard_Filter.aspx');
      await page.getByRole('button', { name: 'Perform this search and go to' }).click();

      const [download] = await Promise.all([
        page.waitForEvent('download'),
        page.getByRole('link', { name: 'Comma Separated File(CSV)' }).click()
      ]);

      /* 3. save locally then upload to Drive */
      const m3   = month.slice(0, 3).toLowerCase();          // jan, feb, …
      const file = `asrs-${m3}-${year}.csv`;
      const tmp  = path.join(tmpDir, file);

      await download.saveAs(tmp);
      expect(fs.existsSync(tmp)).toBeTruthy();
      console.log(`✔ Downloaded ${file}`);

      await uploadCsv(tmp, file);                            // ← Drive upload

      /* 4. tidy-up */
      await browser.close();
      await new Promise(r => setTimeout(r, COOLDOWN_MS));
    }
  }
});
