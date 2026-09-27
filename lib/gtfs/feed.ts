import packed from "../generated/feed.json";
import { Schedule } from "../schedule";
import { unpackTables, type PackedTables } from "./tables";

let schedule: Schedule | undefined;

/** The bundled Caltrain feed, indexed on first use. */
export function getSchedule(): Schedule {
  schedule ??= new Schedule(unpackTables(packed as PackedTables));
  return schedule;
}
