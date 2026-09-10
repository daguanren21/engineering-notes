import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { DigestState } from "./types.ts";

const statePath = fileURLToPath(new URL("./state.json", import.meta.url));
const seenLimit = 3000;
const recentTeamLimit = 30;

export async function loadState(): Promise<DigestState> {
  try {
    const raw = JSON.parse(await readFile(statePath, "utf8")) as Partial<DigestState>;
    return {
      seen: Array.isArray(raw.seen) ? raw.seen.filter((id) => typeof id === "string") : [],
      recentTeams: Array.isArray(raw.recentTeams)
        ? raw.recentTeams.filter((team) => typeof team === "string").slice(0, recentTeamLimit)
        : [],
    };
  } catch {
    return { seen: [], recentTeams: [] };
  }
}

export async function saveState(state: DigestState): Promise<void> {
  const trimmed: DigestState = {
    seen: state.seen.slice(-seenLimit),
    recentTeams: state.recentTeams.slice(0, recentTeamLimit),
  };
  await mkdir(dirname(statePath), { recursive: true });
  await writeFile(statePath, `${JSON.stringify(trimmed, null, 2)}\n`, "utf8");
}
