import { expect, test } from "bun:test";
import { OPEN_MANY_PATH } from "./utils/openManyInWorker.js";

test("threads opening connections at the same moment each get their own", () => {
	const run = Bun.spawnSync([process.execPath, OPEN_MANY_PATH]);
	expect(run.exitCode).toBe(0);
	expect(JSON.parse(run.stdout.toString())).toEqual({
		opened: 10_000,
		distinct: 10_000,
		misrouted: 0,
	});
}, 60_000);
