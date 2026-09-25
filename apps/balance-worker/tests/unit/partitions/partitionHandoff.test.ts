import { describe, expect, test } from "bun:test";
import { ownedPartitionHealthOf } from "../../../src/health/ownedPartitionHealth.js";
import { createPartitions } from "../../../src/partitions/createPartitions.js";
import type {
	PartitionChangeListeners,
	PartitionOwnershipPublication,
	PartitionRuntimeFactory,
	PartitionsConfig,
	PartitionsDependencies,
} from "../../../src/partitions/types/partitions.js";
import type { PartitionRuntimeStatus } from "../../../src/runtime/types/partitionRuntimeState.js";

const deferred = () => {
	let resolve = (): void => undefined;
	const promise = new Promise<void>((settle) => {
		resolve = settle;
	});
	return { promise, resolve };
};

const waitFor = async (condition: () => boolean, attempts = 200) => {
	for (let attempt = 0; attempt < attempts; attempt++) {
		if (condition()) return;
		await Bun.sleep(1);
	}
	throw new Error("Condition was not reached");
};

const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 5));

type OwnershipEvent =
	| { type: "ready"; partition: number; endpoint: string }
	| { type: "claimed"; partition: number; endpoint: string; routeEpoch: string }
	| { type: "unowned"; partition: number; endpoint: string };

/** The ownership topic as two workers see it: every publish reaches every waiter. */
const createOwnershipLog = () => {
	const records: OwnershipEvent[] = [];
	/** Both workers' lifecycle events in one order, so cross-worker ordering can be asserted. */
	const events: string[] = [];
	const listeners = new Set<(event: OwnershipEvent) => void>();
	let offset = 100;
	const publish = (event: OwnershipEvent) => {
		records.push(event);
		for (const listener of [...listeners]) listener(event);
	};
	const await_ = <Result>({
		signal,
		match,
	}: {
		signal: AbortSignal;
		match: (event: OwnershipEvent) => Result | undefined;
	}) =>
		new Promise<Result>((resolve, reject) => {
			if (signal.aborted) return reject(signal.reason);
			const listener = (event: OwnershipEvent) => {
				const result = match(event);
				if (result === undefined) return;
				listeners.delete(listener);
				signal.removeEventListener("abort", abort);
				resolve(result);
			};
			const abort = () => {
				listeners.delete(listener);
				reject(signal.reason);
			};
			listeners.add(listener);
			signal.addEventListener("abort", abort, { once: true });
		});
	return {
		records,
		events,
		nextEpoch: () => String(++offset),
		publish,
		await: await_,
	};
};

type WorkerOptions = {
	name: string;
	log: ReturnType<typeof createOwnershipLog>;
	config?: Partial<PartitionsConfig>;
	drainGate?: Promise<void>;
	prepareGate?: Promise<void>;
	activateGate?: Promise<void>;
	awaitReadyAnnouncement?: PartitionsDependencies["awaitReadyAnnouncement"];
};

const createWorker = ({
	name,
	log,
	config,
	drainGate,
	prepareGate,
	activateGate,
	awaitReadyAnnouncement,
}: WorkerOptions) => {
	const { events } = log;
	const errors: unknown[] = [];
	const endpoint = `http://${name}`;
	let listeners: PartitionChangeListeners;
	const statuses = new Map<number, () => PartitionRuntimeStatus>();
	const createRuntime: PartitionRuntimeFactory = ({ partition }) => {
		let status: PartitionRuntimeStatus = "created";
		statuses.set(partition, () => status);
		const record = (event: string) =>
			events.push(`${name}:${event}:${partition}`);
		const getHealth = () =>
			ownedPartitionHealthOf({
				topic: "metering",
				partition,
				status,
				localNextOffset: 0n,
				consumedNextOffset: 0n,
				highWatermark: 0n,
				failureReason: null,
			});
		const runtime = {
			prepare: async () => {
				record("prepare");
				await prepareGate;
				status = "prepared";
			},
			activate: async () => {
				record("activate");
				status = "activating";
				await activateGate;
				status = "ready";
			},
			drain: async () => {
				record("withdraw");
				status = "draining";
				await drainGate;
				record("drained");
			},
			stop: async () => {
				status = "stopped";
				record("stop");
			},
			waitForQuiescence: async () => undefined,
			getHealth,
			subscribeUnavailable: () => () => undefined,
			process: async () => {
				throw new Error("No command fixture");
			},
		};
		const publication: PartitionOwnershipPublication = {
			claim: async (params) => {
				const named = params?.endpoint ?? endpoint;
				record(`claim:${named.replace("http://", "")}`);
				const routeEpoch = log.nextEpoch();
				log.publish({
					type: "claimed",
					partition,
					endpoint: named,
					routeEpoch,
				});
				return { routeEpoch };
			},
			release: async () => {
				record("release");
				log.publish({ type: "unowned", partition, endpoint });
			},
			announceReady: async () => {
				record("announce");
				log.publish({ type: "ready", partition, endpoint });
			},
			awaitReady: ({ signal }) =>
				log.await({
					signal,
					match: (event) =>
						event.type === "ready" &&
						event.partition === partition &&
						event.endpoint !== endpoint
							? { endpoint: event.endpoint }
							: undefined,
				}),
			awaitClaim: ({ signal }) =>
				log.await({
					signal,
					match: (event) =>
						event.type === "claimed" &&
						event.partition === partition &&
						event.endpoint === endpoint
							? { routeEpoch: event.routeEpoch }
							: undefined,
				}),
		};
		return { runtime, publication, markUnavailable: () => undefined };
	};
	const pauses: string[] = [];
	const resumes: string[] = [];
	const ownership = createPartitions({
		config: {
			topic: "metering",
			commandTopic: "commands",
			healthRefreshIntervalMs: 60_000,
			handoffReadyTimeoutMs: 100,
			handoffClaimTimeoutMs: 100,
			...config,
		},
		ctx: {
			createRuntime,
			awaitReadyAnnouncement,
			consumer: {
				start: async () => undefined,
				stop: async () => {
					events.push(`${name}:consumer-stop`);
				},
				pause: ({ topic, partitions }) => {
					pauses.push(`${topic}:${partitions.join(",")}`);
				},
				resume: ({ topic, partitions }) => {
					resumes.push(`${topic}:${partitions.join(",")}`);
				},
			},
			partitionOffsets: {
				connect: async () => undefined,
				disconnect: async () => undefined,
				fetchHighWatermarks: async () => ({ readHighWatermark: () => 0n }),
			},
			progress: {
				readProgress: () => ({
					localNextOffset: 0n,
					consumedNextOffset: 0n,
					highWatermark: 0n,
				}),
				observeHighWatermark: () => undefined,
			},
			subscribePartitionChanges: (subscribers) => {
				listeners = subscribers;
				return () => undefined;
			},
			onError: ({ cause }) => {
				errors.push(cause);
			},
			onUnhealthyPartition: () => undefined,
		},
	});
	const causeForPartition = () => new Error("revoked");
	return {
		name,
		endpoint,
		ownership,
		events,
		errors,
		pauses,
		resumes,
		status: (partition: number) => statuses.get(partition)?.(),
		assign: (partitions: number[]) =>
			listeners.onAssigned({ partitions, causeForPartition }),
		revoke: () => listeners.onRevoked({ causeForPartition }),
		has: (event: string) => events.includes(`${name}:${event}`),
		index: (event: string) => events.indexOf(`${name}:${event}`),
	};
};

/** Brings a worker up as the sole owner of `partitions`: no predecessor answers, so it claims for itself. */
const ownAlone = async (
	worker: ReturnType<typeof createWorker>,
	partitions: number[],
) => {
	await worker.ownership.start();
	worker.assign(partitions);
	for (const partition of partitions)
		await waitFor(() => worker.has(`claim:${worker.name}:${partition}`));
	await waitFor(() =>
		partitions.every((partition) => worker.status(partition) === "ready"),
	);
};

describe("partition handoff", () => {
	test("the successor never fences before the predecessor has drained", async () => {
		const log = createOwnershipLog();
		const drain = deferred();
		const A = createWorker({ name: "A", log, drainGate: drain.promise });
		const B = createWorker({
			name: "B",
			log,
			config: { handoffClaimTimeoutMs: 5_000 },
		});
		try {
			await ownAlone(A, [2]);
			const held = A.ownership.findRuntime({ partition: 2, routeEpoch: "101" });
			expect(held).toBeDefined();

			A.revoke();
			await B.ownership.start();
			B.assign([2]);
			await waitFor(() => B.has("announce:2"));
			await waitFor(() => A.has("withdraw:2"));
			await settle();

			// A is still draining: B has been assigned for a while but must not fence.
			expect(A.has("drained:2")).toBe(false);
			expect(B.has("activate:2")).toBe(false);
			expect(B.status(2)).toBe("prepared");
			expect(
				A.ownership.findRuntime({ partition: 2, routeEpoch: "101" }),
			).toBeUndefined();

			drain.resolve();
			await waitFor(() => B.status(2) === "ready");

			expect(A.index("drained:2")).toBeLessThan(A.index("claim:B:2"));
			expect(A.index("claim:B:2")).toBeLessThan(B.index("activate:2"));
			expect(A.has("release:2")).toBe(false);
			const claim = log.records.find(
				(event) => event.type === "claimed" && event.endpoint === B.endpoint,
			);
			expect(claim?.type).toBe("claimed");
			if (claim?.type !== "claimed") throw new Error("unreachable");
			expect(
				B.ownership.findRuntime({ partition: 2, routeEpoch: claim.routeEpoch }),
			).toBeDefined();
			await waitFor(() => A.has("stop:2"));
			expect(A.errors).toEqual([]);
			expect(B.errors).toEqual([]);
		} finally {
			drain.resolve();
			await A.ownership.stop();
			await B.ownership.stop();
		}
	});

	test("a request meeting a withdrawn route waits until the successor is named", async () => {
		const log = createOwnershipLog();
		const drain = deferred();
		const A = createWorker({ name: "A", log, drainGate: drain.promise });
		const B = createWorker({
			name: "B",
			log,
			config: { handoffClaimTimeoutMs: 5_000 },
		});
		try {
			await ownAlone(A, [2]);
			A.revoke();
			await B.ownership.start();
			B.assign([2]);
			await waitFor(() => A.has("withdraw:2"));

			let settled = false;
			const waiting = A.ownership.awaitHandoff({ partition: 2 }).then(() => {
				settled = true;
			});
			await settle();
			expect(settled).toBe(false);
			drain.resolve();
			await waiting;
			expect(A.has("claim:B:2")).toBe(true);
			// Nothing to wait for once the successor is named, or on a partition that is not mid-handoff.
			await A.ownership.awaitHandoff({ partition: 2 });
			await A.ownership.awaitHandoff({ partition: 9 });
		} finally {
			drain.resolve();
			await A.ownership.stop();
			await B.ownership.stop();
		}
	});

	test("no ready in time: the predecessor withdraws, drains and releases as before", async () => {
		const log = createOwnershipLog();
		const A = createWorker({
			name: "A",
			log,
			config: { handoffReadyTimeoutMs: 20 },
		});
		try {
			await ownAlone(A, [2]);
			A.revoke();
			await settle();
			expect(A.status(2)).toBe("ready");
			expect(
				A.ownership.findRuntime({ partition: 2, routeEpoch: "101" }),
			).toBeDefined();
			await waitFor(() => A.has("release:2"));
			expect(A.index("withdraw:2")).toBeLessThan(A.index("drained:2"));
			expect(A.index("drained:2")).toBeLessThan(A.index("release:2"));
			expect(
				A.events.some((e) => e.startsWith("A:claim:") && e !== "A:claim:A:2"),
			).toBe(false);
			await waitFor(() => A.has("stop:2"));
			expect(A.errors).toEqual([]);
		} finally {
			await A.ownership.stop();
		}
	});

	test("no claim in time: the successor claims for itself after activating", async () => {
		const log = createOwnershipLog();
		const B = createWorker({
			name: "B",
			log,
			config: { handoffClaimTimeoutMs: 20 },
		});
		try {
			await B.ownership.start();
			B.assign([2]);
			await waitFor(() => B.has("announce:2"));
			await settle();
			expect(B.has("activate:2")).toBe(false);
			await waitFor(() => B.status(2) === "ready");
			expect(B.index("announce:2")).toBeLessThan(B.index("activate:2"));
			expect(B.index("activate:2")).toBeLessThan(B.index("claim:B:2"));
			expect(
				B.ownership.findRuntime({ partition: 2, routeEpoch: "101" }),
			).toBeDefined();
			expect(B.errors).toEqual([]);
		} finally {
			await B.ownership.stop();
		}
	});

	test("A→A: a partition assigned back cancels its handoff and never bounces", async () => {
		const log = createOwnershipLog();
		const A = createWorker({
			name: "A",
			log,
			config: { handoffReadyTimeoutMs: 20 },
		});
		try {
			await ownAlone(A, [1, 2]);
			const before = A.events.length;
			A.revoke();
			A.assign([2]);
			await Bun.sleep(40);
			expect(A.status(2)).toBe("ready");
			expect(
				A.ownership.findRuntime({ partition: 2, routeEpoch: "102" }),
			).toBeDefined();
			expect(A.events.slice(before).filter((e) => e.endsWith(":2"))).toEqual(
				[],
			);
			// The kept partition is not paused again: its follower keeps its position.
			expect(A.pauses).toEqual(["metering:1,2", "commands:1,2"]);
			// Partition 1 was not assigned back: it takes the release path after the ready timeout.
			await waitFor(() => A.has("release:1"));
			await waitFor(() => A.has("stop:1"));
			expect(A.ownership.partitions().map((h) => h.partition)).toEqual([1, 2]);

			// A partition can be handed off more than once: a later revoke waits for ready again.
			A.revoke();
			A.assign([]);
			await waitFor(() => A.has("release:2"));
			expect(A.errors).toEqual([]);
		} finally {
			await A.ownership.stop();
		}
	});

	test("A→A: a partition already withdrawn finishes retiring before it starts afresh", async () => {
		const log = createOwnershipLog();
		const drain = deferred();
		const A = createWorker({
			name: "A",
			log,
			config: { handoffReadyTimeoutMs: 1 },
			drainGate: drain.promise,
		});
		try {
			await ownAlone(A, [2]);
			A.revoke();
			await waitFor(() => A.has("withdraw:2"));
			A.assign([2]);
			await settle();
			expect(A.events.filter((e) => e === "A:prepare:2")).toHaveLength(1);
			drain.resolve();
			await waitFor(
				() => A.events.filter((e) => e === "A:prepare:2").length === 2,
			);
			expect(A.index("stop:2")).toBeLessThan(
				A.events.lastIndexOf("A:prepare:2"),
			);
			await waitFor(() => A.status(2) === "ready");
			expect(A.errors).toEqual([]);
		} finally {
			drain.resolve();
			await A.ownership.stop();
		}
	});

	test("service stop leaves the group first and serves until the successor is ready", async () => {
		const log = createOwnershipLog();
		const A = createWorker({ name: "A", log });
		const B = createWorker({
			name: "B",
			log,
			config: { handoffClaimTimeoutMs: 5_000 },
		});
		try {
			await ownAlone(A, [2]);
			const stopping = A.ownership.stop();
			await settle();
			expect(A.has("consumer-stop")).toBe(true);
			expect(A.status(2)).toBe("ready");
			expect(
				A.ownership.findRuntime({ partition: 2, routeEpoch: "101" }),
			).toBeDefined();

			await B.ownership.start();
			B.assign([2]);
			await stopping;
			expect(A.index("consumer-stop")).toBeLessThan(A.index("withdraw:2"));
			expect(A.index("drained:2")).toBeLessThan(A.index("claim:B:2"));
			expect(A.index("claim:B:2")).toBeLessThan(B.index("activate:2"));
			expect(A.has("release:2")).toBe(false);
			await waitFor(() => B.status(2) === "ready");
			expect(A.errors).toEqual([]);
			expect(B.errors).toEqual([]);
		} finally {
			await A.ownership.stop();
			await B.ownership.stop();
		}
	});

	test("the ready announcement waits for the policy hook", async () => {
		const log = createOwnershipLog();
		const release = deferred();
		const B = createWorker({
			name: "B",
			log,
			awaitReadyAnnouncement: () => release.promise,
		});
		try {
			await B.ownership.start();
			B.assign([2]);
			await waitFor(() => B.status(2) === "prepared");
			await settle();
			expect(B.has("announce:2")).toBe(false);
			release.resolve();
			await waitFor(() => B.has("announce:2"));
			expect(B.index("prepare:2")).toBeLessThan(B.index("announce:2"));
		} finally {
			release.resolve();
			await B.ownership.stop();
		}
	});

	test("a partition revoked while still preparing is retired, not handed off", async () => {
		const log = createOwnershipLog();
		const prepare = deferred();
		const A = createWorker({ name: "A", log, prepareGate: prepare.promise });
		try {
			await A.ownership.start();
			A.assign([2]);
			await waitFor(() => A.has("prepare:2"));
			A.revoke();
			prepare.resolve();
			await waitFor(() => A.has("stop:2"));
			expect(A.has("announce:2")).toBe(false);
			expect(A.events.some((e) => e.startsWith("A:claim:"))).toBe(false);
		} finally {
			prepare.resolve();
			await A.ownership.stop();
		}
	});
});
