/**
 * Diagnóstico: chama a Real-Time API e imprime os diretos já agregados por canal.
 *   npm run chartbeat:live
 */
import { fetchLiveInventory, getChartbeatApiKey } from "../lib/chartbeat/client";
import { buildSnapshot } from "../lib/chartbeat/aggregate";
import { CHANNELS } from "../lib/chartbeat/channels";

async function main() {
  const key = getChartbeatApiKey();
  if (!key) {
    console.error("CHARTBEAT_API_KEY missing");
    process.exit(1);
  }
  const { pages, videos } = await fetchLiveInventory(key);
  const snap = buildSnapshot(pages, videos);
  console.log("captured", snap.capturedAt);
  console.log("pages", snap.pageCount, "matched", snap.matchedCount);
  console.log("--- channels ---");
  for (const c of snap.channels) {
    const meta = CHANNELS.find((x) => x.slug === c.slug)!;
    console.log(
      `${meta.name.padEnd(20)} ${String(c.people).padStart(5)}  web=${c.web} app=${c.app}  prog=${JSON.stringify(c.programTitle)}  src=${c.sources.length}`
    );
    for (const s of c.sources) {
      console.log(`   ${String(s.people).padStart(5)}  [${s.kind}]  ${s.path}`);
    }
  }
  console.log("--- unmatched ---");
  for (const u of snap.unmatched) console.log(`  ${u.people}  ${u.path}  ${u.title}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
