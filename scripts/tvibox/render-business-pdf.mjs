/**
 * Gera o PDF de business case TVI BOX a partir do HTML.
 *   npm run tvibox:business-pdf
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const html = resolve("docs/tvibox-business-case.html");
const outDocs = resolve("docs/tvibox-business-case.pdf");
const outArt = "/opt/cursor/artifacts/tvi_box_business_case_proveitos_5_10_20m.pdf";

async function main() {
  mkdirSync(dirname(outArt), { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto(pathToFileURL(html).href, { waitUntil: "networkidle" });
  const opts = {
    printBackground: true,
    preferCSSPageSize: true,
    displayHeaderFooter: false,
  };
  await page.pdf({ path: outDocs, ...opts });
  await page.pdf({ path: outArt, ...opts });
  await browser.close();
  console.log("wrote", outDocs);
  console.log("wrote", outArt);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
