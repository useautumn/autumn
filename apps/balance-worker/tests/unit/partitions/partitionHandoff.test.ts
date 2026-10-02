import { describe, expect, test } from "bun:test";
import { createStandbyPreparations } from "../../../src/blueGreen/createStandbyPreparations.js";
import { ownedPartitionHealthOf } from "../../../src/health/ownedPartitionHealth.js";
import { StateAheadOfKafkaLogEndError } from "../../../src/kafka/meteringConsumer/meteringErrors.js";
import { createPartitions } from "../../../src/partitions/createPartitions.js";
import type {
	PartitionChangeListeners,
	PartitionOwnershipPublication,
	PartitionRuntimeFactory,
	PartitionsConfig,
	PartitionsDependencies,
} from "../../../src/partitions/types/partitions.js";
import {
	OwnedPartitionRecoveryRequiredError,
	PartitionPreparationFailedError,
} from "../../../src/runtime/runtimeErrors.js";
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
	| { type: "preparing"; partition: number; endpoint: string }
	| { type: "draining"; partition: number; endpoint: string; successor: string }
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
	/** The latest claim or release for a partition, as the tail would have seen it. */
	const owner = ({ partition }: { partition: number }) => {
		for (let i = records.length - 1; i >= 0; i--) {
			const event = records[i];
			if (!event || event.partition !== partition) continue;
			if (event.type === "claimed") return event.endpoint;
			if (event.type === "unowned") return null;
		}
		return undefined;
	};
	/** A preparation announced and not yet concluded by a claim, release, or that worker's ready. */
	const activePreparation = ({ partition }: { partition: number }) => {
		for (let i = records.length - 1; i >= 0; i--) {
			const event = records[i];
			if (!event || event.partition !== partition) continue;
			if (event.type === "claimed" || event.type === "unowned") return null;
			if (event.type === "preparing") return { endpoint: event.endpoint };
			if (event.type === "ready") return null;
		}
		return null;
	};
	/** A drain by the current owner not yet concluded by a claim. */
	const activeDrain = ({ partition }: { partition: number }) => {
		for (let i = records.length - 1; i >= 0; i--) {
			const event = records[i];
			if (!event || event.partition !== partition) continue;
			if (event.type === "claimed" || event.type === "unowned") return null;
			if (event.type === "draining")
				return event.endpoint === owner({ partition })
					? { endpoint: event.endpoint }
					: null;
		}
		return null;
	};
	return {
		records,
		events,
		nextEpoch: () => String(++offset),
		publish,
		await: await_,
		owner,
		activeDrain,
		activePreparation,
	};
};

type WorkerOptions = {
	name: string;
	log: ReturnType<typeof createOwnershipLog>;
	config?: Partial<PartitionsConfig>;
	drainGate?: Promise<void>;
	/** Holds the `draining` send; a slow topic must never hold the drain itself. */
	announceDrainingGate?: Promise<void>;
	prepareGate?: Promise<void>;
	prepareFailures?: Map<number, unknown>;
	activateGate?: Promise<void>;
	awaitReadyAnnouncement?: PartitionsDependencies["awaitReadyAnnouncement"];
	acquirePreparation?: PartitionsDependencies["acquirePreparation"];
	/** Never hears a successor's `ready`: stands in for an owner that is dead or wedged. */
	deaf?: boolean;
	/** Says nothing before preparing: stands in for a successor on a build without the announcement. */
	silentPreparation?: boolean;
};

const createWorker = ({
	name,
	log,
	config,
	drainGate,
	announceDrainingGate,
	prepareGate,
	prepareFailures,
	activateGate,
	awaitReadyAnnouncement,
	acquirePreparation,
	deaf = false,
	silentPreparation = false,
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
				const failure = prepareFailures?.get(partition);
				if (failure !== undefined) {
					prepareFailures?.delete(partition);
					status = "recovery_required";
					throw failure;
				}
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
			announcePreparing: async () => {
				if (silentPreparation) return;
				record("preparing");
				log.publish({ type: "preparing", partition, endpoint });
			},
			readActivePreparation: () => {
				const preparation = log.activePreparation({ partition });
				return preparation && preparation.endpoint !== endpoint
					? preparation
					: null;
			},
			awaitPreparing: ({ signal }) =>
				log.await({
					signal,
					match: (event) =>
						!deaf &&
						event.type === "preparing" &&
						event.partition === partition &&
						event.endpoint !== endpoint
							? { endpoint: event.endpoint }
							: undefined,
				}),
			announceDraining: async ({ successor }) => {
				record("draining");
				await announceDrainingGate;
				log.publish({ type: "draining", partition, endpoint, successor });
			},
			readActiveDrain: () => {
				const drain = log.activeDrain({ partition });
				return drain && drain.endpoint !== endpoint ? drain : null;
			},
			awaitDraining: ({ signal }) =>
				log.await({
					signal,
					match: (event) => {
						if (event.type !== "draining" || event.partition !== partition)
							return undefined;
						if (event.endpoint === endpoint) return undefined;
						if (event.successor === endpoint)
							return { endpoint: event.endpoint };
						const owner = log.owner({ partition });
						return owner === undefined || owner === event.endpoint
							? { endpoint: event.endpoint }
							: undefined;
					},
				}),
			awaitForeignClaim: ({ signal }) =>
				log.await({
					signal,
					match: (event) =>
						event.type === "claimed" &&
						event.partition === partition &&
						event.endpoint !== endpoint
							? { endpoint: event.endpoint }
							: undefined,
				}),
			awaitReady: ({ signal }) =>
				log.await({
					signal,
					match: (event) =>
						!deaf &&
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
			acquirePreparation,
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

const preparesOf = (worker: ReturnType<typeof createWorker>) =>
	worker.events.filter((event) => event.startsWith(`${worker.name}:prepare:`))
		.length;

describe("standby preparation limit", () => {
	const holdReady: PartitionsDependencies["awaitReadyAnnouncement"] = ({
		signal,
	}) =>
		new Promise((_resolve, reject) =>
			signal.addEventListener("abort", () => reject(signal.reason), {
				once: true,
			}),
		);

	test("a standby worker prepares its partitions one at a time and still prepares them all", async () => {
		const log = createOwnershipLog();
		const prepare = deferred();
		const standby = createStandbyPreparations({
			ctx: {
				gate: { isActive: () => false, subscribe: () => () => undefined },
			},
			config: { concurrency: 1 },
		});
		const B = createWorker({
			name: "B",
			log,
			prepareGate: prepare.promise,
			awaitReadyAnnouncement: holdReady,
			acquirePreparation: standby.acquire,
		});
		try {
			await B.ownership.start();
			B.assign([1, 2, 3]);
			await waitFor(() => preparesOf(B) === 1);
			await settle();
			expect(preparesOf(B)).toBe(1);

			prepare.resolve();
			await waitFor(() =>
				[1, 2, 3].every((partition) => B.status(partition) === "prepared"),
			);
			expect(preparesOf(B)).toBe(3);
			expect(B.errors).toEqual([]);
		} finally {
			prepare.resolve();
			await B.ownership.stop();
		}
	});

	test("a live worker taking over partitions prepares them all at once", async () => {
		const log = createOwnershipLog();
		const prepare = deferred();
		const live = createStandbyPreparations({
			ctx: { gate: { isActive: () => true, subscribe: () => () => undefined } },
			config: { concurrency: 1 },
		});
		const A = createWorker({
			name: "A",
			log,
			prepareGate: prepare.promise,
			acquirePreparation: live.acquire,
		});
		try {
			await A.ownership.start();
			A.assign([1, 2, 3]);
			await waitFor(() => preparesOf(A) === 3);

			prepare.resolve();
			await waitFor(() =>
				[1, 2, 3].every((partition) => A.status(partition) === "ready"),
			);
			expect(A.errors).toEqual([]);
		} finally {
			prepare.resolve();
			await A.ownership.stop();
		}
	});

	test("a standby partition revoked while it waits for its turn retires without preparing", async () => {
		const log = createOwnershipLog();
		const prepare = deferred();
		const standby = createStandbyPreparations({
			ctx: {
				gate: { isActive: () => false, subscribe: () => () => undefined },
			},
			config: { concurrency: 1 },
		});
		const B = createWorker({
			name: "B",
			log,
			prepareGate: prepare.promise,
			awaitReadyAnnouncement: holdReady,
			acquirePreparation: standby.acquire,
		});
		try {
			await B.ownership.start();
			B.assign([1, 2]);
			await waitFor(() => preparesOf(B) === 1);
			B.revoke();
			prepare.resolve();
			await waitFor(() => B.has("stop:1") && B.has("stop:2"));
			expect(preparesOf(B)).toBe(1);
		} finally {
			prepare.resolve();
			await B.ownership.stop();
		}
	});
});

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
			// The route it claimed for the successor is what a caller meeting the withdrawn route is told to try.
			expect(A.ownership.findSuccessor({ partition: 2 })).toEqual({
				partition: 2,
				endpoint: "http://B",
				routeEpoch: expect.any(String),
			});
			expect(A.ownership.findSuccessor({ partition: 9 })).toBeUndefined();
			// Nothing to wait for once the successor is named, or on a partition that is not mid-handoff.
			await A.ownership.awaitHandoff({ partition: 2 });
			await A.ownership.awaitHandoff({ partition: 9 });
		} finally {
			drain.resolve();
			await A.ownership.stop();
			await B.ownership.stop();
		}
	});

	test("a successor that announced it is preparing is waited for past the ready timeout", async () => {
		// Run 60 on staging: a grow put the partition on an idle worker whose preparation outran the
		// old owner's 5 s wait, the old owner released, and nobody owned the partition for 8 s.
		const log = createOwnershipLog();
		const prepare = deferred();
		const A = createWorker({
			name: "A",
			log,
			config: { handoffReadyTimeoutMs: 20, handoffDrainCapMs: 5_000 },
		});
		const B = createWorker({ name: "B", log, prepareGate: prepare.promise });
		try {
			await ownAlone(A, [2]);
			A.revoke();
			await B.ownership.start();
			B.assign([2]);
			await waitFor(() => B.has("preparing:2"));
			// Well past the ready timeout: A heard B preparing, keeps serving, and has not released.
			await Bun.sleep(60);
			expect(A.has("release:2")).toBe(false);
			expect(A.has("withdraw:2")).toBe(false);
			expect(A.status(2)).toBe("ready");

			prepare.resolve();
			await waitFor(() => B.status(2) === "ready");
			expect(A.has("release:2")).toBe(false);
			expect(A.index("withdraw:2")).toBeLessThan(A.index("claim:B:2"));
			expect(B.has("claim:B:2")).toBe(false);
			expect(A.errors).toEqual([]);
			expect(B.errors).toEqual([]);
		} finally {
			prepare.resolve();
			await A.ownership.stop();
			await B.ownership.stop();
		}
	});

	test("a preparation that never becomes ready still ends in a release at the drain cap", async () => {
		const log = createOwnershipLog();
		const prepare = deferred();
		const A = createWorker({
			name: "A",
			log,
			config: { handoffReadyTimeoutMs: 20, handoffDrainCapMs: 60 },
		});
		const B = createWorker({ name: "B", log, prepareGate: prepare.promise });
		try {
			await ownAlone(A, [2]);
			A.revoke();
			await B.ownership.start();
			B.assign([2]);
			await waitFor(() => B.has("preparing:2"));
			await waitFor(() => A.has("release:2"), 400);
			expect(A.index("withdraw:2")).toBeLessThan(A.index("release:2"));
			expect(A.errors).toEqual([]);
		} finally {
			prepare.resolve();
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

	test("a slow predecessor that announced draining is not fenced by the claim timeout", async () => {
		const log = createOwnershipLog();
		const drain = deferred();
		const A = createWorker({ name: "A", log, drainGate: drain.promise });
		const B = createWorker({
			name: "B",
			log,
			config: { handoffClaimTimeoutMs: 20, handoffDrainCapMs: 5_000 },
		});
		try {
			await ownAlone(A, [2]);
			A.revoke();
			await B.ownership.start();
			B.assign([2]);
			await waitFor(() => A.has("draining:2"));
			expect(A.index("withdraw:2")).toBeLessThan(A.index("draining:2"));
			// Well past the claim timeout: B heard A draining and keeps waiting.
			await Bun.sleep(60);
			expect(B.has("activate:2")).toBe(false);
			expect(B.status(2)).toBe("prepared");

			drain.resolve();
			await waitFor(() => B.status(2) === "ready");
			expect(A.index("drained:2")).toBeLessThan(A.index("claim:B:2"));
			expect(A.index("claim:B:2")).toBeLessThan(B.index("activate:2"));
			expect(B.has("claim:B:2")).toBe(false);
			expect(A.errors).toEqual([]);
			expect(B.errors).toEqual([]);
		} finally {
			drain.resolve();
			await A.ownership.stop();
			await B.ownership.stop();
		}
	});

	test("the partition moves on mid-drain: the replacement waits out the drain, then claims after silence", async () => {
		const log = createOwnershipLog();
		const drain = deferred();
		const A = createWorker({ name: "A", log, drainGate: drain.promise });
		const B = createWorker({ name: "B", log });
		const C = createWorker({
			name: "C",
			log,
			config: { handoffClaimTimeoutMs: 20, handoffDrainCapMs: 5_000 },
		});
		try {
			await ownAlone(A, [2]);
			A.revoke();
			// B is chosen, then the roster moves the partition on to C before A finishes.
			await B.ownership.start();
			B.assign([2]);
			await waitFor(() => A.has("draining:2"));
			B.revoke();
			await C.ownership.start();
			C.assign([2]);
			await waitFor(() => C.has("announce:2"));
			// A's drain names B, but A still owns the partition: C must not fence it at its own timeout.
			await Bun.sleep(60);
			expect(C.has("activate:2")).toBe(false);
			expect(C.has("claim:C:2")).toBe(false);

			// A finishes and names B, who is gone. Silence follows, so C claims for itself.
			drain.resolve();
			await waitFor(() => A.has("claim:B:2"));
			await waitFor(() => C.has("claim:C:2"));
			expect(A.index("drained:2")).toBeLessThan(C.index("claim:C:2"));
			expect(B.has("activate:2")).toBe(false);
			expect(C.errors).toEqual([]);
		} finally {
			drain.resolve();
			await A.ownership.stop();
			await B.ownership.stop();
			await C.ownership.stop();
		}
	});

	test("a late draining record from a past owner does not hold the next successor", async () => {
		const log = createOwnershipLog();
		const A = createWorker({ name: "A", log });
		const B = createWorker({ name: "B", log, deaf: true });
		const C = createWorker({
			name: "C",
			log,
			config: { handoffClaimTimeoutMs: 20, handoffDrainCapMs: 5_000 },
		});
		try {
			await ownAlone(A, [2]);
			A.revoke();
			await B.ownership.start();
			B.assign([2]);
			await waitFor(() => B.status(2) === "ready");
			// B owns it and never answers (deaf to C's ready, standing in for a dead owner).
			await C.ownership.start();
			C.assign([2]);
			await waitFor(() => C.has("announce:2"));
			const announcedAt = Date.now();
			// A's drain record lands late: A is a past owner, so it says nothing about B being alive.
			log.publish({
				type: "draining",
				partition: 2,
				endpoint: "http://A",
				successor: "http://B",
			});
			await waitFor(() => C.has("claim:C:2"));
			// Silence timeout, not the drain cap.
			expect(Date.now() - announcedAt).toBeLessThan(1_000);
			expect(C.errors).toEqual([]);
		} finally {
			await A.ownership.stop();
			await B.ownership.stop();
			await C.ownership.stop();
		}
	});

	test("a slow draining send does not hold the drain or the claim", async () => {
		const log = createOwnershipLog();
		const send = deferred();
		const A = createWorker({
			name: "A",
			log,
			announceDrainingGate: send.promise,
		});
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
			// The send never completes, yet A drains and names B regardless.
			await waitFor(() => B.status(2) === "ready");
			expect(A.index("drained:2")).toBeLessThan(A.index("claim:B:2"));
			expect(B.has("claim:B:2")).toBe(false);
			expect(A.errors).toEqual([]);
		} finally {
			send.resolve();
			await A.ownership.stop();
			await B.ownership.stop();
		}
	});

	test("a drain the store refused names no successor; the successor claims for itself", async () => {
		const log = createOwnershipLog();
		const refused = Promise.reject(new Error("store refused the apply"));
		void refused.catch(() => undefined);
		const A = createWorker({ name: "A", log, drainGate: refused });
		const B = createWorker({
			name: "B",
			log,
			config: { handoffClaimTimeoutMs: 20, handoffDrainCapMs: 40 },
		});
		try {
			await ownAlone(A, [2]);
			A.revoke();
			await B.ownership.start();
			B.assign([2]);
			await waitFor(() => A.has("stop:2"));
			expect(A.has("claim:B:2")).toBe(false);
			expect(A.has("release:2")).toBe(false);
			expect(
				log.records.some(
					(event) => event.type === "claimed" && event.endpoint === B.endpoint,
				),
			).toBe(false);
			await waitFor(() => B.status(2) === "ready", 1_000);
			expect(B.has("claim:B:2")).toBe(true);
		} finally {
			await A.ownership.stop();
			await B.ownership.stop();
		}
	});

	test("the drain cap bounds how long a draining predecessor can hold the successor", async () => {
		const log = createOwnershipLog();
		const drain = deferred();
		const A = createWorker({ name: "A", log, drainGate: drain.promise });
		const B = createWorker({
			name: "B",
			log,
			config: { handoffClaimTimeoutMs: 20, handoffDrainCapMs: 100 },
		});
		try {
			await ownAlone(A, [2]);
			A.revoke();
			await B.ownership.start();
			B.assign([2]);
			await waitFor(() => A.has("draining:2"));
			await Bun.sleep(50);
			expect(B.status(2)).toBe("prepared");
			// The predecessor never finishes: past the cap the successor claims for itself, as it would in silence.
			await waitFor(() => B.status(2) === "ready", 1_000);
			expect(B.index("activate:2")).toBeLessThan(B.index("claim:B:2"));
			expect(A.has("claim:B:2")).toBe(false);
			expect(B.errors).toEqual([]);
		} finally {
			drain.resolve();
			await A.ownership.stop();
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

	test("an admitted owner hands off to a successor that announces ready, with no revoke of its own", async () => {
		// Two fleets, two rosters: green is assigned the partition by its own group while blue keeps it in its group.
		const log = createOwnershipLog();
		const slotFlip = deferred();
		const blue = createWorker({ name: "A", log });
		const green = createWorker({
			name: "B",
			log,
			awaitReadyAnnouncement: () => slotFlip.promise,
			config: { handoffClaimTimeoutMs: 5_000 },
		});
		try {
			await ownAlone(blue, [2]);
			await green.ownership.start();
			green.assign([2]);
			await waitFor(() => green.status(2) === "prepared");
			await settle();
			expect(blue.has("withdraw:2")).toBe(false);
			expect(blue.status(2)).toBe("ready");

			slotFlip.resolve();
			await waitFor(() => green.status(2) === "ready");
			expect(blue.index("withdraw:2")).toBeLessThan(blue.index("drained:2"));
			expect(blue.index("drained:2")).toBeLessThan(blue.index("claim:B:2"));
			expect(blue.index("claim:B:2")).toBeLessThan(green.index("activate:2"));
			expect(blue.has("release:2")).toBe(false);
			expect(green.has("claim:B:2")).toBe(false);
			// Blue's roster still deals it the partition, so blue itself stops fetching its commands.
			expect(blue.pauses).toContain("commands:2");
			await waitFor(() => blue.has("stop:2"));
			expect(blue.ownership.findOwnedRuntime({ partition: 2 })).toBeUndefined();
			expect(blue.errors).toEqual([]);
			expect(green.errors).toEqual([]);
		} finally {
			slotFlip.resolve();
			await blue.ownership.stop();
			await green.ownership.stop();
		}
	});

	test("a partition handed to another fleet is prepared again and returns on a reverse flip", async () => {
		// Each fleet's gate is a deferred the test swaps: resolved means the record names that fleet.
		const log = createOwnershipLog();
		const open = () => {
			const gate = deferred();
			gate.resolve();
			return gate;
		};
		const gates = { blue: open(), green: deferred() };
		// Like the real hook: resolves when the gate opens, rejects with the signal's reason on a revoke.
		const heldAt =
			(fleet: keyof typeof gates) =>
			({ signal }: { signal: AbortSignal }) =>
				new Promise<void>((resolve, reject) => {
					if (signal.aborted) return reject(signal.reason);
					signal.addEventListener("abort", () => reject(signal.reason), {
						once: true,
					});
					void gates[fleet].promise.then(resolve);
				});
		const blue = createWorker({
			name: "A",
			log,
			awaitReadyAnnouncement: heldAt("blue"),
		});
		const green = createWorker({
			name: "B",
			log,
			awaitReadyAnnouncement: heldAt("green"),
			config: { handoffClaimTimeoutMs: 5_000 },
		});
		try {
			await ownAlone(blue, [2]);
			await green.ownership.start();
			green.assign([2]);
			await waitFor(() => green.status(2) === "prepared");

			// Flip to green: blue hands off, then prepares the partition again and holds at its (now closed) gate.
			gates.blue = deferred();
			gates.green.resolve();
			await waitFor(() => green.status(2) === "ready");
			await waitFor(() => blue.has("stop:2"));
			await waitFor(
				() => blue.events.filter((e) => e === "A:prepare:2").length === 2,
			);
			await waitFor(() => blue.status(2) === "prepared");
			await settle();
			expect(blue.events.filter((e) => e === "A:announce:2")).toHaveLength(1);
			expect(blue.ownership.findOwnedRuntime({ partition: 2 })).toBeUndefined();
			// Its own roster dealing it the partition again changes nothing: it stays prepared and silent.
			blue.revoke();
			blue.assign([2]);
			await waitFor(() => blue.status(2) === "prepared");
			await settle();
			expect(blue.events.filter((e) => e === "A:announce:2")).toHaveLength(1);
			expect(green.status(2)).toBe("ready");

			// Flip back to blue: blue announces, green hands off and names blue, blue serves again.
			gates.green = deferred();
			gates.blue.resolve();
			await waitFor(() => blue.status(2) === "ready");
			expect(green.index("drained:2")).toBeLessThan(green.index("claim:A:2"));
			expect(green.has("release:2")).toBe(false);
			// Named by green, never claimed for itself a second time.
			expect(blue.events.filter((e) => e === "A:claim:A:2")).toHaveLength(1);
			expect(green.has("claim:A:2")).toBe(true);
			expect(blue.ownership.findOwnedRuntime({ partition: 2 })).toBeDefined();
			// Green in turn is prepared again for the next flip.
			await waitFor(() => green.status(2) === "prepared");
			// The revoke above interrupted a held startup, which is reported the way any revoke mid-startup is.
			expect(blue.errors.map(String)).toEqual([
				"PartitionRetiredError: Partition retired",
			]);
			expect(green.errors).toEqual([]);
		} finally {
			gates.blue.resolve();
			gates.green.resolve();
			await blue.ownership.stop();
			await green.ownership.stop();
		}
	});

	test("without a gate a partition handed to another fleet is not prepared again", async () => {
		const log = createOwnershipLog();
		const slotFlip = deferred();
		const blue = createWorker({ name: "A", log });
		const green = createWorker({
			name: "B",
			log,
			awaitReadyAnnouncement: () => slotFlip.promise,
			config: { handoffClaimTimeoutMs: 5_000 },
		});
		try {
			await ownAlone(blue, [2]);
			await green.ownership.start();
			green.assign([2]);
			await waitFor(() => green.status(2) === "prepared");
			slotFlip.resolve();
			await waitFor(() => green.status(2) === "ready");
			await waitFor(() => blue.has("stop:2"));
			await settle();
			expect(blue.events.filter((e) => e === "A:prepare:2")).toHaveLength(1);
			expect(blue.status(2)).toBe("stopped");
			expect(green.status(2)).toBe("ready");
		} finally {
			slotFlip.resolve();
			await blue.ownership.stop();
			await green.ownership.stop();
		}
	});

	test("a partition handed back to its owner still hands off to a later foreign ready", async () => {
		const log = createOwnershipLog();
		const A = createWorker({ name: "A", log });
		const B = createWorker({
			name: "B",
			log,
			config: { handoffClaimTimeoutMs: 5_000 },
		});
		try {
			await ownAlone(A, [2]);
			A.revoke();
			A.assign([2]);
			await settle();
			expect(A.has("withdraw:2")).toBe(false);

			await B.ownership.start();
			B.assign([2]);
			await waitFor(() => B.status(2) === "ready");
			expect(A.index("drained:2")).toBeLessThan(A.index("claim:B:2"));
			expect(A.has("release:2")).toBe(false);
			expect(A.errors).toEqual([]);
			expect(B.errors).toEqual([]);
		} finally {
			await A.ownership.stop();
			await B.ownership.stop();
		}
	});

	test("a standby whose preparation fails is retried alone while its other partitions keep preparing", async () => {
		const log = createOwnershipLog();
		const prepare = deferred();
		const failure = new OwnedPartitionRecoveryRequiredError({
			topic: "metering",
			partition: 2,
			cause: new PartitionPreparationFailedError({
				topic: "metering",
				partition: 2,
				cause: new StateAheadOfKafkaLogEndError({
					topic: "metering",
					partition: 2,
					storedNextOffset: 7n,
					logEndOffset: 5n,
				}),
			}),
		});
		const B = createWorker({
			name: "B",
			log,
			config: { partitionBootstrapRetryIntervalMs: 10 },
			prepareGate: prepare.promise,
			prepareFailures: new Map([[2, failure]]),
		});
		try {
			await B.ownership.start();
			B.assign([1, 2]);
			await waitFor(
				() => B.events.filter((e) => e === "B:prepare:2").length === 2,
			);
			expect(B.status(1)).toBe("created");
			expect(B.has("consumer-stop")).toBe(false);
		} finally {
			prepare.resolve();
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
