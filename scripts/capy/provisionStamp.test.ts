import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	isProvisionCurrent,
	provisionFingerprint,
	writeProvisionStamp,
} from "./provisionStamp.ts";

describe("capy provision stamp", () => {
	const dirs: string[] = [];
	const createRepo = () => {
		const repoRoot = mkdtempSync(join(tmpdir(), "capy-stamp-"));
		dirs.push(repoRoot);
		mkdirSync(join(repoRoot, "shared/drizzle/meta"), { recursive: true });
		mkdirSync(join(repoRoot, "server"), { recursive: true });
		writeFileSync(join(repoRoot, "shared/drizzle/0000_init.sql"), "create");
		writeFileSync(join(repoRoot, "shared/drizzle/meta/_journal.json"), "{}");
		writeFileSync(join(repoRoot, "server/.env.local"), "A=1\n");
		return repoRoot;
	};
	const base = { bootId: "boot-1", machineId: "capy-a", optIns: [] };
	afterEach(() => {
		for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true });
	});

	test("a second run in the same boot with unchanged inputs is current", () => {
		const repoRoot = createRepo();
		const stampPath = join(repoRoot, "provisioned");
		writeProvisionStamp({
			stampPath,
			fingerprint: provisionFingerprint({ repoRoot, ...base }),
		});
		expect(
			isProvisionCurrent({
				stampPath,
				fingerprint: provisionFingerprint({ repoRoot, ...base }),
			}),
		).toBe(true);
	});

	test("a reboot, new migration, env edit or trigger opt-in forces a re-provision", () => {
		const repoRoot = createRepo();
		const original = provisionFingerprint({ repoRoot, ...base });
		expect(
			provisionFingerprint({ repoRoot, ...base, bootId: "boot-2" }),
		).not.toBe(original);
		expect(
			provisionFingerprint({ repoRoot, ...base, optIns: ["trigger"] }),
		).not.toBe(original);

		writeFileSync(join(repoRoot, "shared/drizzle/0001_next.sql"), "alter");
		const withMigration = provisionFingerprint({ repoRoot, ...base });
		expect(withMigration).not.toBe(original);

		rmSync(join(repoRoot, "server/.env.local"));
		expect(provisionFingerprint({ repoRoot, ...base })).not.toBe(withMigration);
	});

	test("a missing stamp is never current", () => {
		const repoRoot = createRepo();
		expect(
			isProvisionCurrent({
				stampPath: join(repoRoot, "provisioned"),
				fingerprint: provisionFingerprint({ repoRoot, ...base }),
			}),
		).toBe(false);
	});
});
