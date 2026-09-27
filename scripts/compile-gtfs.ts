/**
 * Compile the GTFS feed in data/gtfs/caltrain-ca-us into lib/generated/feed.json,
 * keeping only the tables and columns the schedule engine reads. The server
 * imports the JSON, so a cold start never parses CSV.
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { TABLE_FILES, packTables, tablesFromCsv, type GtfsTables } from "../lib/gtfs/tables";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const feedDir = join(root, "data", "gtfs", "caltrain-ca-us");
const outFile = join(root, "lib", "generated", "feed.json");

const files: Partial<Record<keyof GtfsTables, string>> = {};
for (const [key, file] of Object.entries(TABLE_FILES) as [keyof GtfsTables, string][]) {
  const path = join(feedDir, file);
  if (existsSync(path)) files[key] = readFileSync(path, "utf8");
}
if (!files.stops || !files.stopTimes || !files.trips) {
  throw new Error(`GTFS feed not found in ${feedDir}. Run \`npm run gtfs:fetch\`.`);
}

const packed = packTables(tablesFromCsv(files));
mkdirSync(dirname(outFile), { recursive: true });
writeFileSync(outFile, JSON.stringify(packed));
const counts = Object.entries(packed)
  .map(([k, v]) => `${k} ${v.rows.length}`)
  .join(", ");
console.log(`GTFS compiled → lib/generated/feed.json (${counts})`);
