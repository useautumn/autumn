import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import { resolveEnvDir } from "@/utils/envUtils";

describe("resolveEnvDir", () => {
	test("monorepo root with package.json still loads server/.env", () => {
		const root = join(import.meta.dir, ".tmp-env-dir-root");
		rmSync(root, { recursive: true, force: true });
		mkdirSync(join(root, "server"), { recursive: true });
		writeFileSync(join(root, "package.json"), "{}");
		writeFileSync(join(root, "server", "package.json"), "{}");
		writeFileSync(
			join(root, "server", ".env"),
			"DATABASE_URL=postgresql://postgres:postgres@localhost:5432/autumn\n",
		);

		expect(resolveEnvDir({ cwd: root, envFileName: ".env" })).toBe(
			join(root, "server"),
		);

		rmSync(root, { recursive: true, force: true });
	});

	test("cwd already in server/ uses that directory", () => {
		const root = join(import.meta.dir, ".tmp-env-dir-server");
		const serverDir = join(root, "server");
		rmSync(root, { recursive: true, force: true });
		mkdirSync(serverDir, { recursive: true });
		writeFileSync(join(serverDir, ".env"), "DATABASE_URL=local\n");

		expect(resolveEnvDir({ cwd: serverDir, envFileName: ".env" })).toBe(
			serverDir,
		);

		rmSync(root, { recursive: true, force: true });
	});
});
