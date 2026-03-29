import * as fs from "fs";
import * as path from "path";

const APP_PREFS_FILE = "nodex-app-prefs.json";

export type NodexAppPrefs = {
  /** When true (default), empty primary/added project folders get sample notes. */
  seedSampleNotes: boolean;
};

const defaultPrefs: NodexAppPrefs = {
  seedSampleNotes: true,
};

export function readAppPrefs(userDataPath: string): NodexAppPrefs {
  const p = path.join(userDataPath, APP_PREFS_FILE);
  if (!fs.existsSync(p)) {
    return { ...defaultPrefs };
  }
  try {
    const j = JSON.parse(fs.readFileSync(p, "utf8")) as Partial<NodexAppPrefs>;
    return {
      seedSampleNotes:
        typeof j.seedSampleNotes === "boolean"
          ? j.seedSampleNotes
          : defaultPrefs.seedSampleNotes,
    };
  } catch {
    return { ...defaultPrefs };
  }
}

export function writeAppPrefs(
  userDataPath: string,
  prefs: Partial<NodexAppPrefs>,
): NodexAppPrefs {
  const cur = readAppPrefs(userDataPath);
  const next: NodexAppPrefs = {
    seedSampleNotes:
      typeof prefs.seedSampleNotes === "boolean"
        ? prefs.seedSampleNotes
        : cur.seedSampleNotes,
  };
  fs.mkdirSync(userDataPath, { recursive: true });
  fs.writeFileSync(
    path.join(userDataPath, APP_PREFS_FILE),
    JSON.stringify(next, null, 2),
    "utf8",
  );
  return next;
}
