import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createAtomEnv } from "@autumn/env/atom";
import { hashToken } from "../../../src/auth/hashToken.js";
import { slotFilePath } from "../../../src/slots/slotFiles.js";
import { createAtomThreads } from "../../../src/threads/createAtomThreads.js";

const MAIN = join(import.meta.dir, "../../../src/main.ts");
const quietLogger = { info() {}, warn() {}, error() {} };
const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
	for (const cleanup of cleanups.splice(0)) await cleanup();
});

const freePort = () => {
	const probe = Bun.serve({
		hostname: "127.0.0.1",
		port: 0,
		fetch: () => new Response(),
	});
	const { port } = probe;
	probe.stop(true);
	return port;
};

test("an Atom whose volume holds a slot file SQLite cannot read starts and serves, instead of failing every boot", async () => {
	const dataDir = mkdtempSync(join(tmpdir(), "atom-unreadable-boot-"));
	writeFileSync(
		slotFilePath({ folder: dataDir, slot: 3, slotCount: 16 }),
		Buffer.alloc(16_384, 7),
	);
	const port = freePort();
	const atom = createAtomThreads({
		ctx: { spawnThread: () => new Worker(MAIN), logger: quietLogger },
		config: {
			env: createAtomEnv({
				ATOM_TOKEN_HASH: hashToken({ token: "atom_token_unreadable" }),
				ATOM_PEER_SECRET: "peer-secret-".repeat(4),
				ATOM_DATA_DIR: dataDir,
				ATOM_PORT: String(port),
				ATOM_PEER_PORT: String(freePort()),
				ATOM_THREADS: "2",
				ATOM_SLOT_COUNT: "16",
				AUTUMN_API_URL: "http://127.0.0.1:9",
			}),
		},
	});
	cleanups.push(async () => {
		await atom.stop();
		rmSync(dataDir, { recursive: true, force: true });
	});

	await atom.start();

	const health = await fetch(`http://127.0.0.1:${port}/health`, {
		headers: { "user-agent": "ELB-HealthChecker/2.0" },
	});
	expect(health.status).toBe(200);
}, 20_000);
