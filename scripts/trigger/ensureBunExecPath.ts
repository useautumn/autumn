/**
 * Trigger's CLI hardcodes `$HOME/.bun/bin/bun` for runtime:"bun" indexing
 * (see execPathForRuntime). Native build hosts often have bun on PATH
 * elsewhere — symlink so spawn doesn't ENOENT after "Successfully built code".
 */
import { existsSync, mkdirSync, symlinkSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

const expectedBunPath = join(homedir(), ".bun", "bin", "bun");

if (existsSync(expectedBunPath)) {
	process.exit(0);
}

// postinstall runs under `bun install`, so execPath is the live bun binary.
const bunPath =
	typeof globalThis.Bun !== "undefined" ? process.execPath : undefined;

if (!bunPath || !existsSync(bunPath)) {
	process.exit(0);
}

mkdirSync(dirname(expectedBunPath), { recursive: true });
symlinkSync(bunPath, expectedBunPath);
