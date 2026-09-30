import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDeployedAuth } from "../../../src/auth/createDeployedAuth.js";
import { hashToken } from "../../../src/auth/hashToken.js";
import type { Auth } from "../../../src/auth/types/auth.js";

const opened: Auth[] = [];
const directories: string[] = [];
const createAuth = () => {
	const dataDir = mkdtempSync(join(tmpdir(), "atom-data-"));
	directories.push(dataDir);
	const auth = createDeployedAuth({
		dataDir,
		tokenHash: hashToken({ token: "token_deployed" }),
		slotCount: 2,
	});
	opened.push(auth);
	return { auth, dataDir };
};
afterEach(() => {
	for (const auth of opened.splice(0)) auth.close();
	for (const directory of directories.splice(0))
		rmSync(directory, { recursive: true, force: true });
});

describe("deployed auth", () => {
	test("the deployment's token opens its data folder; any other opens nothing", () => {
		const { auth } = createAuth();

		expect(auth.authorize({ token: "token_deployed" })).not.toBeNull();
		expect(auth.authorize({ token: "token_other" })).toBeNull();
		expect(auth.authorize({ token: "" })).toBeNull();
	});

	test("the slot files sit directly in the data directory", () => {
		const { dataDir } = createAuth();

		expect(existsSync(join(dataDir, "slot-000-of-002.sqlite"))).toBe(true);
		expect(existsSync(join(dataDir, "slot-001-of-002.sqlite"))).toBe(true);
	});
});
