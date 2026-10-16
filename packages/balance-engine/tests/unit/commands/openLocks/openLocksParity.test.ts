import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runOpenLocksScenario } from "./openLocksScenario.js";

/** Written by the engine at dev 937705228b, before it kept an index over a subject's open locks. */
const golden = join(import.meta.dir, "openLocksParity.golden.json");

test("locks, finalizes, expiries, confirms and their stale repeats answer byte for byte as the engine did before the open-lock index", () => {
	expect(`${JSON.stringify(runOpenLocksScenario(), null, "\t")}\n`).toBe(
		readFileSync(golden, "utf8"),
	);
});
