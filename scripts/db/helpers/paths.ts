import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));

export const REPO_ROOT = resolve(here, "../../..");
export const MIGRATIONS_DIR = resolve(REPO_ROOT, "shared/drizzle");
export const META_DIR = resolve(MIGRATIONS_DIR, "meta");
export const JOURNAL_PATH = resolve(META_DIR, "_journal.json");
