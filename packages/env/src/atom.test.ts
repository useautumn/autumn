import { describe, expect, test } from "bun:test";
import { createAtomEnv } from "./atom.js";

const TOKEN_HASH = "a".repeat(64);
const ADMIN_TOKEN_HASH = "b".repeat(64);
const PUSHES_BINDING = JSON.stringify({
	service: "sqs",
	queueUrl: "https://sqs.us-east-1.amazonaws.com/1/pushes",
});
const PEER_SECRET = "s".repeat(64);
const MULTI_TENANT = {
	ATOM_MODE: "multi_tenant",
	ATOM_TOKEN_HASH: ADMIN_TOKEN_HASH,
	ATOM_PEER_SECRET: PEER_SECRET,
};

describe("atom env", () => {
	test("a customer's Atom sets no ATOM_MODE: unset is single-tenant, given its token hash", () => {
		const env = createAtomEnv({
			ATOM_TOKEN_HASH: TOKEN_HASH,
			ATOM_PEER_SECRET: PEER_SECRET,
			ATOM_HOSTNAME: "0.0.0.0",
		});

		expect(env.ATOM_MODE).toBe("deployed");
		expect(env.ATOM_TOKEN_HASH).toBe(TOKEN_HASH);
	});

	test("a multi-tenant Atom's ATOM_TOKEN_HASH is the admin token that registers its orgs", () => {
		const env = createAtomEnv({ ...MULTI_TENANT, ATOM_HOSTNAME: "0.0.0.0" });

		expect(env.ATOM_MODE).toBe("multi_tenant");
		expect(env.ATOM_TOKEN_HASH).toBe(ADMIN_TOKEN_HASH);
		expect(env.ATOM_HOSTNAME).toBe("0.0.0.0");
	});

	test("neither mode boots without ATOM_PEER_SECRET: every Atom's replicas sign to each other with it", () => {
		expect(() => createAtomEnv({ ATOM_TOKEN_HASH: TOKEN_HASH })).toThrow(
			"Set ATOM_PEER_SECRET",
		);
		expect(() =>
			createAtomEnv({ ATOM_TOKEN_HASH: TOKEN_HASH, ATOM_PEER_SECRET: " " }),
		).toThrow("Set ATOM_PEER_SECRET");
		expect(() =>
			createAtomEnv({ ATOM_MODE: "multi_tenant", ATOM_TOKEN_HASH: TOKEN_HASH }),
		).toThrow("Set ATOM_PEER_SECRET");
		for (const env of [
			createAtomEnv({
				ATOM_TOKEN_HASH: TOKEN_HASH,
				ATOM_PEER_SECRET: ` ${PEER_SECRET} `,
			}),
			createAtomEnv({ ...MULTI_TENANT, ATOM_PEER_SECRET: ` ${PEER_SECRET} ` }),
		])
			expect(env.ATOM_PEER_SECRET).toBe(PEER_SECRET);
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
				createAtomEnv({
					ATOM_MODE: mode,
					ATOM_TOKEN_HASH: TOKEN_HASH,
					ATOM_PEER_SECRET: PEER_SECRET,
				}),
			).toThrow("ATOM_MODE is either unset or multi_tenant");
		expect(
			createAtomEnv({
				ATOM_MODE: " ",
				ATOM_TOKEN_HASH: TOKEN_HASH,
				ATOM_PEER_SECRET: PEER_SECRET,
			}).ATOM_MODE,
		).toBe("deployed");
	});

	test("forwards to the public Autumn API unless told where the API is", () => {
		const deployed = createAtomEnv({
			ATOM_TOKEN_HASH: TOKEN_HASH,
			ATOM_PEER_SECRET: PEER_SECRET,
		});
		const local = createAtomEnv({
			...MULTI_TENANT,
			AUTUMN_API_URL: "http://localhost:8080",
		});

		expect(deployed.ATOM_AUTUMN_API_URL).toBe("https://api.useautumn.com");
		expect(local.ATOM_AUTUMN_API_URL).toBe("http://localhost:8080");
	});

	test("every Atom splits each org's customers over 128 slots unless told otherwise", () => {
		const deployed = createAtomEnv({
			ATOM_TOKEN_HASH: TOKEN_HASH,
			ATOM_PEER_SECRET: PEER_SECRET,
		});
		const multiTenant = createAtomEnv(MULTI_TENANT);
		const told = createAtomEnv({ ...MULTI_TENANT, ATOM_SLOT_COUNT: "2" });

		expect(deployed.ATOM_SLOT_COUNT).toBe(128);
		expect(multiTenant.ATOM_SLOT_COUNT).toBe(128);
		expect(told.ATOM_SLOT_COUNT).toBe(2);
	});

	test("runs as many threads as its container's CPUs and memory allow, up to five", () => {
		const GB = 1024 ** 3;
		const threads = ({ cpus, memory }: { cpus: number; memory: number }) =>
			createAtomEnv(
				{ ATOM_TOKEN_HASH: TOKEN_HASH, ATOM_PEER_SECRET: PEER_SECRET },
				{ availableCpus: cpus, memoryLimitBytes: memory },
			).ATOM_THREADS;

		// Half a CPU and 512 MB, as the stack is provisioned today.
		expect(threads({ cpus: 1, memory: 0.5 * GB })).toBe(1);
		expect(threads({ cpus: 4, memory: 2 * GB })).toBe(4);
		// Eight threads would not fit in 1 GB: memory decides, 288 MiB for the main thread then 384 MiB a thread with its held copies.
		expect(threads({ cpus: 8, memory: 1 * GB })).toBe(1);
		expect(threads({ cpus: 8, memory: 2 * GB })).toBe(4);
		// XXS: a 640 MiB container runs one thread.
		expect(threads({ cpus: 1, memory: 640 * 1024 ** 2 })).toBe(1);
		// Atom's sizes: Medium 3 / 6Gi uses every CPU; Large 7 / 12Gi and XL 15 / 24Gi stop at the cap.
		expect(threads({ cpus: 3, memory: 6 * GB })).toBe(3);
		expect(threads({ cpus: 7, memory: 12 * GB })).toBe(5);
		expect(threads({ cpus: 15, memory: 24 * GB })).toBe(5);
		expect(threads({ cpus: 64, memory: 256 * GB })).toBe(5);
	});

	test("is told how many threads to run when ATOM_THREADS is set", () => {
		const told = createAtomEnv(
			{
				ATOM_TOKEN_HASH: TOKEN_HASH,
				ATOM_PEER_SECRET: PEER_SECRET,
				ATOM_THREADS: "12",
			},
			{
				availableCpus: 2,
				memoryLimitBytes: 1024 ** 3,
			},
		);

		expect(told.ATOM_THREADS).toBe(12);
	});

	test("a multi-tenant Atom sizes its threads like a customer's, and may be told how many", () => {
		const multiTenant = createAtomEnv(MULTI_TENANT, {
			availableCpus: 16,
			memoryLimitBytes: 64 * 1024 ** 3,
		});
		const small = createAtomEnv(MULTI_TENANT, {
			availableCpus: 2,
			memoryLimitBytes: 4 * 1024 ** 3,
		});
		const told = createAtomEnv({ ...MULTI_TENANT, ATOM_THREADS: "3" });

		expect(multiTenant.ATOM_THREADS).toBe(5);
		expect(small.ATOM_THREADS).toBe(2);
		expect(told.ATOM_THREADS).toBe(3);
	});

	test("a multi-tenant Atom reads the push queue like a customer's once it is linked", () => {
		const env = createAtomEnv(
			{ ...MULTI_TENANT, ALIEN_PUSHES_BINDING: PUSHES_BINDING },
			{
				availableCpus: 8,
				memoryLimitBytes: 16 * 1024 ** 3,
			},
		);

		expect(env.ATOM_THREADS).toBe(5);
		expect(env.ATOM_PUSH_RECEIVERS).toBe(2);
	});

	test("about 30% of the threads receive pushes when the push queue is linked, at least one of each", () => {
		const receivers = ({ threads }: { threads: string }) =>
			createAtomEnv({
				ATOM_TOKEN_HASH: TOKEN_HASH,
				ATOM_PEER_SECRET: PEER_SECRET,
				ATOM_THREADS: threads,
				ALIEN_PUSHES_BINDING: PUSHES_BINDING,
			}).ATOM_PUSH_RECEIVERS;

		// A lone thread serves and receives.
		expect(receivers({ threads: "1" })).toBe(1);
		expect(receivers({ threads: "2" })).toBe(1);
		expect(receivers({ threads: "4" })).toBe(1);
		expect(receivers({ threads: "8" })).toBe(2);
	});

	test("no thread receives pushes when no push queue is linked", () => {
		const env = createAtomEnv({
			ATOM_TOKEN_HASH: TOKEN_HASH,
			ATOM_PEER_SECRET: PEER_SECRET,
			ATOM_THREADS: "8",
		});

		expect(env.ATOM_PUSH_RECEIVERS).toBe(0);
	});

	test("ATOM_PUSH_RECEIVERS says how many threads receive, up to every thread", () => {
		const receivers = ({ told }: { told: string }) =>
			createAtomEnv({
				ATOM_TOKEN_HASH: TOKEN_HASH,
				ATOM_PEER_SECRET: PEER_SECRET,
				ATOM_THREADS: "7",
				ALIEN_PUSHES_BINDING: PUSHES_BINDING,
				ATOM_PUSH_RECEIVERS: told,
			}).ATOM_PUSH_RECEIVERS;

		expect(receivers({ told: "7" })).toBe(7);
		expect(receivers({ told: "9" })).toBe(7);
	});

	describe("ATOM_PUSH_QUEUE_CLIENT picks the push reader: the AWS SDK on an SQS queue, else the Alien binding", () => {
		const SQS_QUEUE_URL = "https://sqs.us-east-1.amazonaws.com/1/pushes";
		const PUBSUB_BINDING = JSON.stringify({
			service: "pubsub",
			topic: "projects/p/topics/pushes",
			subscription: "projects/p/subscriptions/pushes",
		});
		const sdkQueueUrl = ({
			client,
			binding,
		}: {
			client?: string;
			binding?: string;
		}) =>
			createAtomEnv({
				ATOM_TOKEN_HASH: TOKEN_HASH,
				ATOM_PEER_SECRET: PEER_SECRET,
				ALIEN_PUSHES_BINDING: binding,
				ATOM_PUSH_QUEUE_CLIENT: client,
			}).ATOM_SDK_PUSH_QUEUE_URL;

		test("auto, the default, reads an SQS queue with the SDK", () => {
			expect(sdkQueueUrl({ binding: PUSHES_BINDING })).toBe(SQS_QUEUE_URL);
			expect(sdkQueueUrl({ client: "auto", binding: PUSHES_BINDING })).toBe(
				SQS_QUEUE_URL,
			);
		});

		test("auto reads any other queue with the binding", () => {
			expect(sdkQueueUrl({ binding: PUBSUB_BINDING })).toBeNull();
		});

		test("auto with no queue linked has no reader and no receivers", () => {
			const env = createAtomEnv({
				ATOM_TOKEN_HASH: TOKEN_HASH,
				ATOM_PEER_SECRET: PEER_SECRET,
			});

			expect(env.ATOM_SDK_PUSH_QUEUE_URL).toBeNull();
			expect(env.ATOM_PUSH_RECEIVERS).toBe(0);
		});

		test("binding and sdk force their reader; sdk needs an SQS queue", () => {
			expect(
				sdkQueueUrl({ client: "binding", binding: PUSHES_BINDING }),
			).toBeNull();
			expect(sdkQueueUrl({ client: "sdk", binding: PUSHES_BINDING })).toBe(
				SQS_QUEUE_URL,
			);
			expect(() =>
				sdkQueueUrl({ client: "sdk", binding: PUBSUB_BINDING }),
			).toThrow("ALIEN_PUSHES_BINDING");
		});

		test("any other value throws", () => {
			expect(() =>
				sdkQueueUrl({ client: "http", binding: PUSHES_BINDING }),
			).toThrow("ATOM_PUSH_QUEUE_CLIENT");
		});
	});

	test("each thread holds a share of the container's memory in parsed subjects, less the threads' own footprint and the parse expansion", () => {
		const GiB = 1024 ** 3;
		const MiB = 1024 ** 2;
		const heldBytes = ({ cpus, memory }: { cpus: number; memory: number }) =>
			createAtomEnv(
				{ ATOM_TOKEN_HASH: TOKEN_HASH, ATOM_PEER_SECRET: PEER_SECRET },
				{
					availableCpus: cpus,
					memoryLimitBytes: memory,
				},
			).ATOM_HELD_BYTES_PER_THREAD;

		// Large, 12 GiB on 5 threads: (12 GiB − 288 MiB − 5 × 192 MiB) × 0.5 / 5 / 5 ≈ 220 MiB, about 12k subjects of 18.6 KB.
		expect(heldBytes({ cpus: 7, memory: 12 * GiB })).toBe(
			Math.floor(((12 * GiB - 288 * MiB - 5 * 192 * MiB) * 0.5) / 5 / 5),
		);
		expect(heldBytes({ cpus: 7, memory: 12 * GiB })).toBeGreaterThan(220 * MiB);
		// XXS, a 640 MiB container on one thread: (640 − 288 − 192) × 0.5 / 5 = 16 MiB, about 900 subjects.
		expect(heldBytes({ cpus: 1, memory: 640 * MiB })).toBe(16 * MiB);
		// Too small for the threads themselves: nothing is held, and every check reads its row.
		expect(heldBytes({ cpus: 1, memory: 400 * MiB })).toBe(0);
	});

	test("the main thread logs its health every 10s unless told otherwise; an interval that would spin or overflow a timer is refused", () => {
		const everyMs = (value?: string) =>
			createAtomEnv({
				ATOM_TOKEN_HASH: TOKEN_HASH,
				ATOM_PEER_SECRET: PEER_SECRET,
				ATOM_HEALTH_LOG_EVERY_MS: value,
			}).ATOM_HEALTH_LOG_EVERY_MS;

		expect(everyMs()).toBe(10_000);
		expect(everyMs("60000")).toBe(60_000);
		for (const bad of ["0", "-5", "NaN", "abc", "1.5", "999", "3000000000"])
			expect(() => everyMs(bad)).toThrow();
	});

	test("only a replica listening on a loopback address reads its peers from a file; a deployed Atom resolves its service", () => {
		const peersOf = (env: Record<string, string>) => {
			const atom = createAtomEnv({
				ATOM_TOKEN_HASH: TOKEN_HASH,
				ATOM_PEER_SECRET: PEER_SECRET,
				...env,
			});
			return atom.ATOM_PEERS_FILE;
		};

		expect(peersOf({ ATOM_HOSTNAME: "0.0.0.0" })).toBeNull();
		expect(
			peersOf({ ATOM_HOSTNAME: "127.0.0.11", ATOM_PEERS_FILE: "/tmp/peers" }),
		).toBe("/tmp/peers");
		expect(() =>
			peersOf({ ATOM_HOSTNAME: "0.0.0.0", ATOM_PEERS_FILE: "/tmp/peers" }),
		).toThrow("loopback ATOM_HOSTNAME");
	});
});
