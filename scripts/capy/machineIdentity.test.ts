import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getMachineId, stateForMachine } from "./machineIdentity.ts";

describe("capy machine identity", () => {
	const dirs: string[] = [];
	const createDir = () => {
		const dir = mkdtempSync(join(tmpdir(), "capy-identity-"));
		dirs.push(dir);
		return dir;
	};
	const writeMachineConfig = ({
		dir,
		bindingId,
	}: {
		dir: string;
		bindingId: string;
	}) => {
		const path = join(dir, "machine.json");
		writeFileSync(path, JSON.stringify({ bindingId, bearer: "x" }));
		return path;
	};
	afterEach(() => {
		for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true });
	});

	test("a machine-id baked into a snapshot loses to the Capy binding", () => {
		const prefix = createDir();
		writeFileSync(join(prefix, "machine-id"), "capy-baked-into-snapshot\n");
		const machineConfig = writeMachineConfig({
			dir: prefix,
			bindingId: "01ABC",
		});

		expect(getMachineId({ prefix, machineConfig })).toBe("capy-01abc");
	});

	test("two machines restored from one snapshot get different ids", () => {
		const prefix = createDir();
		const first = writeMachineConfig({ dir: createDir(), bindingId: "01AAA" });
		const second = writeMachineConfig({ dir: createDir(), bindingId: "01BBB" });

		expect(getMachineId({ prefix, machineConfig: first })).not.toBe(
			getMachineId({ prefix, machineConfig: second }),
		);
	});

	test("off Capy, the minted id persists across runs", () => {
		const prefix = createDir();
		const minted = getMachineId({
			prefix,
			machineConfig: join(prefix, "absent.json"),
		});

		expect(minted).toMatch(/^capy-[0-9a-f]{16}$/);
		expect(
			getMachineId({ prefix, machineConfig: join(prefix, "absent.json") }),
		).toBe(minted);
	});

	test("state provisioned for another machine is discarded", () => {
		const state = {
			machineId: "capy-baked-into-snapshot",
			branchName: "capy-shared",
		};

		expect(stateForMachine({ state, machineId: "capy-01abc" })).toBeNull();
		expect(
			stateForMachine({ state, machineId: "capy-baked-into-snapshot" }),
		).toBe(state);
	});
});
