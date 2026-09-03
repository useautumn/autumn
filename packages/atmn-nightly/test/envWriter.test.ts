/**
 * The writer has to agree with `loadEnvFiles` about where keys live, and it has
 * to leave every line it did not put there alone.
 */

import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { upsertEnvContent, writeEnvValues } from "../src/env/loadEnv";

const temporaryDirs: string[] = [];

const makeDir = (): string => {
	const dir = mkdtempSync(join(tmpdir(), "atmn-env-"));
	temporaryDirs.push(dir);
	return dir;
};

afterEach(() => {
	for (const dir of temporaryDirs.splice(0)) {
		rmSync(dir, { recursive: true, force: true });
	}
});

test("an existing key is updated in place, keeping its position", () => {
	const content = upsertEnvContent({
		content: "A=1\nAUTUMN_SECRET_KEY=old\nB=2\n",
		values: { AUTUMN_SECRET_KEY: "new" },
	});

	expect(content).toBe("A=1\nAUTUMN_SECRET_KEY=new\nB=2\n");
});

test("unrelated lines survive, comments and blanks included", () => {
	const content = upsertEnvContent({
		content:
			"# billing\nDATABASE_URL=postgres://x\n\n#AUTUMN_SECRET_KEY=commented\n",
		values: { AUTUMN_SECRET_KEY: "new" },
	});

	expect(content).toBe(
		"# billing\nDATABASE_URL=postgres://x\n\n#AUTUMN_SECRET_KEY=commented\nAUTUMN_SECRET_KEY=new\n",
	);
});

test("a key that only shares a prefix is not mistaken for the key", () => {
	const content = upsertEnvContent({
		content: "AUTUMN_SECRET_KEY_OLD=keep\n",
		values: { AUTUMN_SECRET_KEY: "new" },
	});

	expect(content).toBe("AUTUMN_SECRET_KEY_OLD=keep\nAUTUMN_SECRET_KEY=new\n");
});

test("an empty file gets the keys without a leading blank line", () => {
	expect(upsertEnvContent({ content: "", values: { A: "1", B: "2" } })).toBe(
		"A=1\nB=2\n",
	);
});

test(".env.local wins when both files exist", () => {
	const dir = makeDir();
	writeFileSync(join(dir, ".env"), "AUTUMN_SECRET_KEY=from_env\n");
	writeFileSync(join(dir, ".env.local"), "AUTUMN_SECRET_KEY=from_env_local\n");

	const path = writeEnvValues({
		dirs: [dir],
		values: { AUTUMN_SECRET_KEY: "new" },
	});

	expect(path).toBe(join(dir, ".env.local"));
	expect(readFileSync(join(dir, ".env.local"), "utf8")).toBe(
		"AUTUMN_SECRET_KEY=new\n",
	);
	// The lower-precedence file is left exactly as it was.
	expect(readFileSync(join(dir, ".env"), "utf8")).toBe(
		"AUTUMN_SECRET_KEY=from_env\n",
	);
});

test("an env file further up the search path is preferred over a new one", () => {
	const repoRoot = makeDir();
	const packageDir = join(repoRoot, "package");
	writeFileSync(join(repoRoot, ".env"), "A=1\n");

	const path = writeEnvValues({
		dirs: [packageDir, repoRoot],
		values: { AUTUMN_SECRET_KEY: "new" },
	});

	expect(path).toBe(join(repoRoot, ".env"));
});

test("with no env file anywhere, .env is created in the first directory", () => {
	const dir = makeDir();

	const path = writeEnvValues({
		dirs: [dir],
		values: { AUTUMN_SECRET_KEY: "new" },
	});

	expect(path).toBe(join(dir, ".env"));
	expect(readFileSync(path, "utf8")).toBe("AUTUMN_SECRET_KEY=new\n");
});
