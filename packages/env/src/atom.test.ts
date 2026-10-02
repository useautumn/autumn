import { describe, expect, test } from "bun:test";
import { createAtomEnv } from "./atom.js";

const TOKEN_HASH = "a".repeat(64);
const ADMIN_TOKEN_HASH = "b".repeat(64);
const MULTI_TENANT = {
	ATOM_MODE: "multi_tenant",
	ATOM_TOKEN_HASH: ADMIN_TOKEN_HASH,
};

describe("atom env", () => {
	test("a customer's Atom sets no ATOM_MODE: unset is single-tenant, given its token hash", () => {
		const env = createAtomEnv({
			ATOM_TOKEN_HASH: TOKEN_HASH,
			ATOM_HOSTNAME: "0.0.0.0",
		});

		expect(env.ATOM_MODE).toBe("deployed");
		expect(env.ATOM_TOKEN_HASH).toBe(TOKEN_HASH);
	});

	test("a multi-tenant Atom's ATOM_TOKEN_HASH is the admin token that registers its orgs", () => {
		const env = createAtomEnv({
			ATOM_MODE: "multi_tenant",
			ATOM_TOKEN_HASH: ADMIN_TOKEN_HASH,
			ATOM_HOSTNAME: "0.0.0.0",
		});

		expect(env.ATOM_MODE).toBe("multi_tenant");
		expect(env.ATOM_TOKEN_HASH).toBe(ADMIN_TOKEN_HASH);
		expect(env.ATOM_HOSTNAME).toBe("0.0.0.0");
	});

	test("both modes need a SHA-256 ATOM_TOKEN_HASH", () => {
		expect(() => createAtomEnv({})).toThrow("ATOM_TOKEN_HASH");
		expect(() => createAtomEnv({ ATOM_MODE: "multi_tenant" })).toThrow(
			"ATOM_TOKEN_HASH",
		);
		expect(() => createAtomEnv({ ATOM_TOKEN_HASH: "not-a-hash" })).toThrow(
			"SHA-256",
		);
		expect(() =>
			createAtomEnv({ ATOM_MODE: "multi_tenant", ATOM_TOKEN_HASH: "nope" }),
		).toThrow("SHA-256");
	});

	test("multi_tenant is the only ATOM_MODE value; anything else, deployed included, is refused", () => {
		for (const mode of ["dev", "deployed", "shared", "multiTenant"])
			expect(() =>
				createAtomEnv({ ATOM_MODE: mode, ATOM_TOKEN_HASH: TOKEN_HASH }),
			).toThrow("ATOM_MODE is either unset or multi_tenant");
		expect(
			createAtomEnv({ ATOM_MODE: " ", ATOM_TOKEN_HASH: TOKEN_HASH }).ATOM_MODE,
		).toBe("deployed");
	});

	test("forwards to the public Autumn API unless told where the API is", () => {
		const deployed = createAtomEnv({ ATOM_TOKEN_HASH: TOKEN_HASH });
		const local = createAtomEnv({
			...MULTI_TENANT,
			AUTUMN_API_URL: "http://localhost:8080",
		});

		expect(deployed.ATOM_AUTUMN_API_URL).toBe("https://api.useautumn.com");
		expect(local.ATOM_AUTUMN_API_URL).toBe("http://localhost:8080");
	});

	test("every Atom splits each org's customers over 128 slots unless told otherwise", () => {
		const deployed = createAtomEnv({ ATOM_TOKEN_HASH: TOKEN_HASH });
		const multiTenant = createAtomEnv(MULTI_TENANT);
		const told = createAtomEnv({ ...MULTI_TENANT, ATOM_SLOT_COUNT: "2" });

		expect(deployed.ATOM_SLOT_COUNT).toBe(128);
		expect(multiTenant.ATOM_SLOT_COUNT).toBe(128);
		expect(told.ATOM_SLOT_COUNT).toBe(2);
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

	test("a multi-tenant Atom is always one process", () => {
		const multiTenant = createAtomEnv(MULTI_TENANT, {
			availableCpus: 16,
			memoryLimitBytes: 64 * 1024 ** 3,
		});

		expect(multiTenant.ATOM_PROCESSES).toBe(1);
		expect(() =>
			createAtomEnv({ ...MULTI_TENANT, ATOM_PROCESSES: "2" }),
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
