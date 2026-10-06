import { describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	ATOM_BOOTED_AT,
	ATOM_RESTARTS_FILE,
	createAtomHealthReader,
	markAtomBoot,
} from "../../../src/init/atomHealth.js";

const newRestartsFile = () =>
	join(mkdtempSync(join(tmpdir(), "atom-health-")), "restarts");

describe("Atom health", () => {
	test("a process with no supervisor reports its own start and no restarts", () => {
		const readHealth = createAtomHealthReader({
			env: {},
			processStartedAt: "2026-10-05T21:00:00.000Z",
		});

		expect(readHealth()).toEqual({
			status: "alive",
			bootedAt: "2026-10-05T21:00:00.000Z",
			restarts: 0,
		});
	});

	test("a child reports the supervisor's boot and its respawn count", () => {
		const env: Record<string, string | undefined> = {};
		const { recordRestarts } = markAtomBoot({
			env,
			now: () => new Date("2026-10-05T21:00:00.000Z"),
			restartsFile: newRestartsFile(),
		});
		recordRestarts({ restarts: 2 });

		const readHealth = createAtomHealthReader({ env });

		expect(env[ATOM_BOOTED_AT]).toBe("2026-10-05T21:00:00.000Z");
		expect(readHealth()).toEqual({
			status: "alive",
			bootedAt: "2026-10-05T21:00:00.000Z",
			restarts: 2,
		});
	});

	test("the restarts file is read at most once a second", () => {
		const restartsFile = newRestartsFile();
		writeFileSync(restartsFile, "1");
		let now = 0;
		const readHealth = createAtomHealthReader({
			env: { [ATOM_BOOTED_AT]: "x", [ATOM_RESTARTS_FILE]: restartsFile },
			clock: () => now,
		});

		expect(readHealth().restarts).toBe(1);
		writeFileSync(restartsFile, "3");
		now = 999;
		expect(readHealth().restarts).toBe(1);
		now = 1000;
		expect(readHealth().restarts).toBe(3);
	});
});
