import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { machineId } from "./machineId.ts";

const homes: string[] = [];

afterEach(async () => {
	await Promise.all(homes.splice(0).map((dir) => rm(dir, { recursive: true })));
});

describe("machineId", () => {
	test("persists the same id for a home dir", async () => {
		const home = await mkdtemp(join(tmpdir(), "dw-machine-"));
		homes.push(home);
		const first = machineId({ home });
		const second = machineId({ home });
		expect(first).toMatch(/^[a-f0-9]{16}$/);
		expect(second).toBe(first);
	});

	test("different homes get different ids", async () => {
		const a = await mkdtemp(join(tmpdir(), "dw-machine-a-"));
		const b = await mkdtemp(join(tmpdir(), "dw-machine-b-"));
		homes.push(a, b);
		expect(machineId({ home: a })).not.toBe(machineId({ home: b }));
	});
});
