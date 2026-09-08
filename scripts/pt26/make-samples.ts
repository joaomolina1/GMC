/**
 * Gera os ficheiros Excel de exemplo da zona PT26 em samples/pt26/ (três semanas).
 *   npx tsx scripts/pt26/make-samples.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { buildWorkbookFromValues } from "../../lib/pt26/excel";
import { SAMPLE_WEEKS, sampleFileName, sampleWorkbookSheets } from "../../lib/pt26/samples";

const outDir = path.resolve(process.cwd(), "samples/pt26");
mkdirSync(outDir, { recursive: true });

for (const week of SAMPLE_WEEKS) {
  const bytes = buildWorkbookFromValues(sampleWorkbookSheets(week));
  const file = path.join(outDir, sampleFileName(week));
  writeFileSync(file, bytes);
  console.log(`✔ ${path.relative(process.cwd(), file)} (${bytes.byteLength} bytes)`);
}
