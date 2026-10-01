import { describe, expect, test } from "bun:test";
import { createAtomEnv } from "./atom.js";

const TOKEN_HASH = "a".repeat(64);

describe("atom env", () => {
	test("an org's deployment is given its token hash", () => {
		const env = createAtomEnv({
			ATOM_TOKEN_HASH: TOKEN_HASH,
			ATOM_HOSTNAME: "0.0.0.0",
		});

		expect(env.ATOM_DEV).toBe(false);
		expect(env.ATOM_TOKEN_HASH).toBe(TOKEN_HASH);
	});

	test("a dev stack needs nothing but the flag", () => {
		const env = createAtomEnv({ ATOM_DEV: "true" });

		expect(env.ATOM_DEV).toBe(true);
		expect(env.ATOM_HOSTNAME).toBe("127.0.0.1");
	});

	test("dev mode never listens beyond loopback", () => {
		expect(() =>
			createAtomEnv({ ATOM_DEV: "true", ATOM_HOSTNAME: "0.0.0.0" }),
		).toThrow("loopback");
	});

	test("neither or both modes is refused", () => {
		expect(() => createAtomEnv({})).toThrow("ATOM_TOKEN_HASH");
		expect(() =>
			createAtomEnv({ ATOM_DEV: "true", ATOM_TOKEN_HASH: TOKEN_HASH }),
		).toThrow("not both");
		expect(() => createAtomEnv({ ATOM_TOKEN_HASH: "not-a-hash" })).toThrow(
			"SHA-256",
		);
	});

	test("forwards to the public Autumn API unless told where the API is", () => {
		const deployed = createAtomEnv({ ATOM_TOKEN_HASH: TOKEN_HASH });
		const local = createAtomEnv({
			ATOM_DEV: "true",
			AUTUMN_API_URL: "http://localhost:8080",
		});

		expect(deployed.ATOM_AUTUMN_API_URL).toBe("https://api.useautumn.com");
		expect(local.ATOM_AUTUMN_API_URL).toBe("http://localhost:8080");
	});

	test("an org's deployment splits its customers over 128 slots, a dev stack over 2, unless told otherwise", () => {
		const deployed = createAtomEnv({ ATOM_TOKEN_HASH: TOKEN_HASH });
		const dev = createAtomEnv({ ATOM_DEV: "true" });
		const told = createAtomEnv({ ATOM_DEV: "true", ATOM_SLOT_COUNT: "16" });

		expect(deployed.ATOM_SLOT_COUNT).toBe(128);
		expect(dev.ATOM_SLOT_COUNT).toBe(2);
		expect(told.ATOM_SLOT_COUNT).toBe(16);
	});

	test("runs as many processes as both its CPUs and its memory allow, up to 8", () => {
		const GB = 1024 ** 3;
		const processes = ({ cpus, memory }: { cpus: number; memory: number }) =>
			createAtomEnv(
				{ ATOM_TOKEN_HASH: TOKEN_HASH },
				{ availableCpus: cpus, memoryLimitBytes: memory },
			).ATOM_PROCESSES;

		// Half a CPU and 512 MB, as the stack is provisioned today.
		expect(processes({ cpus: 1, memory: 0.5 * GB })).toBe(1);
		expect(processes({ cpus: 4, memory: 2 * GB })).toBe(4);
		// Eight processes would not fit in 1 GB: memory decides.
		expect(processes({ cpus: 8, memory: 1 * GB })).toBe(2);
		// A container with no limits sees the whole host: the cap decides.
		expect(processes({ cpus: 64, memory: 256 * GB })).toBe(8);
	});

	test("is told how many processes to run when ATOM_PROCESSES is set", () => {
		const told = createAtomEnv(
			{ ATOM_TOKEN_HASH: TOKEN_HASH, ATOM_PROCESSES: "12" },
			{ availableCpus: 2, memoryLimitBytes: 1024 ** 3 },
		);

		expect(told.ATOM_PROCESSES).toBe(12);
	});

	test("a dev stack is always one process", () => {
		const dev = createAtomEnv(
			{ ATOM_DEV: "true" },
			{ availableCpus: 16, memoryLimitBytes: 64 * 1024 ** 3 },
		);

		expect(dev.ATOM_PROCESSES).toBe(1);
		expect(() =>
			createAtomEnv({ ATOM_DEV: "true", ATOM_PROCESSES: "2" }),
		).toThrow("one process");
	});

	test("about 30% of the processes receive pushes when the push queue is linked, at least one of each", () => {
		const writers = ({ processes }: { processes: string }) =>
			createAtomEnv({
				ATOM_TOKEN_HASH: TOKEN_HASH,
				ATOM_PROCESSES: processes,
				ALIEN_PUSHES_BINDING: "{}",
			}).ATOM_WRITERS;

		// A lone process serves and receives.
		expect(writers({ processes: "1" })).toBe(1);
		expect(writers({ processes: "2" })).toBe(1);
		expect(writers({ processes: "4" })).toBe(1);
		expect(writers({ processes: "8" })).toBe(2);
	});

	test("no process receives pushes when no push queue is linked", () => {
		const env = createAtomEnv({
			ATOM_TOKEN_HASH: TOKEN_HASH,
			ATOM_PROCESSES: "8",
		});

		expect(env.ATOM_WRITERS).toBe(0);
	});
});
