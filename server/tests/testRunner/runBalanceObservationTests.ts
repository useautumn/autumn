import { resolve } from "node:path";

if (!process.env.BALANCE_OBSERVATION_TEST_REDIS_SOCKET) {
	throw new Error(
		"Set BALANCE_OBSERVATION_TEST_REDIS_SOCKET to an isolated local Redis Unix socket (redis-server --port 0 --save '' --appendonly no --unixsocket <path>)",
	);
}
const serverRoot = resolve(import.meta.dir, "../..");
const files = [
	...new Bun.Glob(
		"tests/integration/redis/source-observation/*.test.ts",
	).scanSync({ cwd: serverRoot }),
].sort();
const processHandle = Bun.spawn([process.execPath, "test", ...files], {
	cwd: serverRoot,
	// These tests use real Lua but do not load an application or its secrets.
	env: { ...process.env, UNIT_TESTS: "1", UNIT_TEST_FILES: files.join("\n") },
	stdout: "inherit",
	stderr: "inherit",
});
process.exit(await processHandle.exited);
