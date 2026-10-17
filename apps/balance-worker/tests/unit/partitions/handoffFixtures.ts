/** Workers sharing one in-memory ownership topic: the handoff protocol end to end without Kafka. */
import { ownedPartitionHealthOf } from "../../../src/health/ownedPartitionHealth.js";
import { createPartitions } from "../../../src/partitions/createPartitions.js";
import type {
	PartitionChangeListeners,
	PartitionOwnershipPublication,
	PartitionRuntimeFactory,
	PartitionServiceStopReason,
	PartitionsConfig,
	PartitionsDependencies,
	PartitionUnavailableListener,
} from "../../../src/partitions/types/partitions.js";
import type { PartitionRuntimeStatus } from "../../../src/runtime/types/partitionRuntimeState.js";

export const deferred = () => {
	let resolve = (): void => undefined;
	const promise = new Promise<void>((settle) => {
		resolve = settle;
	});
	return { promise, resolve };
};

export const waitFor = async (condition: () => boolean, attempts = 200) => {
	for (let attempt = 0; attempt < attempts; attempt++) {
		if (condition()) return;
		await Bun.sleep(1);
	}
	throw new Error("Condition was not reached");
};

export const settle = () =>
	new Promise<void>((resolve) => setTimeout(resolve, 5));

export type OwnershipEvent =
	| { type: "ready"; partition: number; endpoint: string; readyAt?: number }
	| { type: "preparing"; partition: number; endpoint: string }
	| { type: "draining"; partition: number; endpoint: string; successor: string }
	| { type: "claimed"; partition: number; endpoint: string; routeEpoch: string }
	| { type: "unowned"; partition: number; endpoint: string };

/** The ownership topic as two workers see it: every publish reaches every waiter. */
export const createOwnershipLog = () => {
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
	const release = ({
		partition,
		from,
		endpoint,
		readyAt,
	}: {
		partition: number;
		from: number;
		endpoint: string;
		readyAt: number;
	}) => {
		let holder: string | null = null;
		let freedBy: string | null = null;
		let readies: { endpoint: string; readyAt?: number }[] = [];
		for (const event of records.slice(from)) {
			if (event.partition !== partition) continue;
			if (event.type === "claimed") {
				holder = event.endpoint;
				freedBy = null;
				readies = [];
			} else if (event.type === "unowned" && event.endpoint === holder) {
				holder = null;
				freedBy = event.endpoint;
			} else if (event.type === "ready")
				readies.push({ endpoint: event.endpoint, readyAt: event.readyAt });
		}
		if (freedBy === null) return null;
		const ownReady = readies.some(
			(ready) => ready.endpoint === endpoint && ready.readyAt === readyAt,
		);
		const rivalReady = readies.some((ready) => ready.endpoint !== endpoint);
		return ownReady && !rivalReady ? { endpoint: freedBy } : null;
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
		release,
	};
};

export type WorkerOptions = {
	name: string;
	log: ReturnType<typeof createOwnershipLog>;
	config?: Partial<PartitionsConfig>;
	drainGate?: Promise<void>;
	/** Holds the `draining` send; a slow topic must never hold the drain itself. */
	announceDrainingGate?: Promise<void>;
	prepareGate?: Promise<void>;
	prepareFailures?: Map<number, unknown>;
	stopFailures?: Map<number, unknown>;
	activateGate?: Promise<void>;
	/** Holds the fence a worker writes after claiming for itself. */
	fenceGate?: Promise<void>;
	awaitReadyAnnouncement?: PartitionsDependencies["awaitReadyAnnouncement"];
	acquirePreparation?: PartitionsDependencies["acquirePreparation"];
	/** Never hears a successor's `ready`: stands in for an owner that is dead or wedged. */
	deaf?: boolean;
	/** Says nothing before preparing: stands in for a successor on a build without the announcement. */
	silentPreparation?: boolean;
	readyGate?: Promise<void>;
	failReady?: boolean;
};

export const createWorker = ({
	name,
	log,
	config,
	drainGate,
	announceDrainingGate,
	prepareGate,
	prepareFailures,
	stopFailures,
	activateGate,
	fenceGate,
	awaitReadyAnnouncement,
	acquirePreparation,
	deaf = false,
	silentPreparation = false,
	readyGate,
	failReady = false,
}: WorkerOptions) => {
	const { events } = log;
	const tailFrom = log.records.length;
	const errors: unknown[] = [];
	const stopped: PartitionServiceStopReason[] = [];
	const endpoint = `http://${name}`;
	let listeners: PartitionChangeListeners;
	/** A killed process: nothing it starts afterwards completes, and nothing it publishes lands. */
	let dead = false;
	const SYNCHRONOUS = new Set([
		"getHealth",
		"subscribeUnavailable",
		"readActivePreparation",
		"readActiveDrain",
		"readRelease",
	]);
	function untilKilled<Port extends object>(port: Port): Port {
		return new Proxy(port, {
			get(target, key, receiver) {
				const value = Reflect.get(target, key, receiver);
				if (typeof value !== "function" || SYNCHRONOUS.has(String(key)))
					return value;
				return (...args: unknown[]) =>
					dead ? new Promise(() => undefined) : value.apply(target, args);
			},
		});
	}
	const statuses = new Map<number, () => PartitionRuntimeStatus>();
	const failures = new Map<number, (cause?: unknown) => void>();
	const createRuntime: PartitionRuntimeFactory = ({ partition }) => {
		let status: PartitionRuntimeStatus = "created";
		statuses.set(partition, () => status);
		const unavailableListeners = new Set<PartitionUnavailableListener>();
		failures.set(partition, (cause: unknown = new Error("runtime failed")) => {
			status = "recovery_required";
			for (const listener of unavailableListeners) listener({ cause });
		});
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
			fence: async () => {
				record("fence");
				await fenceGate;
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
				const failure = stopFailures?.get(partition);
				if (failure === undefined) return;
				stopFailures?.delete(partition);
				throw failure;
			},
			waitForQuiescence: async () => undefined,
			getHealth,
			subscribeUnavailable: (listener: PartitionUnavailableListener) => {
				unavailableListeners.add(listener);
				return () => {
					unavailableListeners.delete(listener);
				};
			},
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
			announceReady: async (params) => {
				record("announce");
				if (failReady) throw new Error("Ready send failed");
				log.publish({
					type: "ready",
					partition,
					endpoint,
					readyAt: params?.readyAt,
				});
				await readyGate;
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
			readRelease: ({ readyAt }) =>
				log.release({ partition, from: tailFrom, endpoint, readyAt }),
			awaitRelease: ({ signal, afterReadyAt }) =>
				log.await({
					signal,
					match: (event) => {
						if (event.partition !== partition) return undefined;
						if (event.type !== "ready" && event.type !== "unowned")
							return undefined;
						return (
							log.release({
								partition,
								from: tailFrom,
								endpoint,
								readyAt: afterReadyAt,
							}) ?? undefined
						);
					},
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
			awaitClaim: ({ signal, afterReadyAt }) => {
				let answersReady = afterReadyAt === undefined;
				return log.await({
					signal,
					match: (event) => {
						if (event.partition !== partition || event.endpoint !== endpoint)
							return undefined;
						if (event.type === "ready" && event.readyAt === afterReadyAt)
							answersReady = true;
						return event.type === "claimed" && answersReady
							? { routeEpoch: event.routeEpoch }
							: undefined;
					},
				});
			},
			awaitRouteClaim: ({ signal }) => publication.awaitClaim({ signal }),
		};
		return {
			runtime: untilKilled(runtime),
			publication: untilKilled(publication),
			markUnavailable: () => undefined,
		};
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
				leave: async () => {
					events.push(`${name}:consumer-leave`);
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
			onServiceStopped: (reason) => {
				stopped.push(reason);
			},
		},
	});
	const causeForPartition = () => new Error("revoked");
	return {
		name,
		endpoint,
		ownership,
		events,
		errors,
		stopped,
		pauses,
		resumes,
		status: (partition: number) => statuses.get(partition)?.(),
		assign: (partitions: number[]) =>
			listeners.onAssigned({ partitions, causeForPartition }),
		revoke: () => listeners.onRevoked({ causeForPartition }),
		crash: (cause: unknown) => listeners.onCrashed({ cause, restart: false }),
		has: (event: string) => events.includes(`${name}:${event}`),
		index: (event: string) => events.indexOf(`${name}:${event}`),
		fail: (partition: number, cause?: unknown) =>
			failures.get(partition)?.(cause),
		kill: () => {
			dead = true;
		},
		isDead: () => dead,
	};
};

/** Brings a worker up as the sole owner of `partitions`: no predecessor answers, so it claims for itself. */
export const ownAlone = async (
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

/** The route servers hold: the newest `claimed` for the partition (ownershipReplay applies claims in offset order). */
export const latestClaim = ({
	log,
	partition,
}: {
	log: ReturnType<typeof createOwnershipLog>;
	partition: number;
}) => {
	let newest: { endpoint: string; routeEpoch: string } | undefined;
	for (const event of log.records) {
		if (event.type !== "claimed" || event.partition !== partition) continue;
		if (newest && BigInt(event.routeEpoch) <= BigInt(newest.routeEpoch))
			continue;
		newest = { endpoint: event.endpoint, routeEpoch: event.routeEpoch };
	}
	return newest;
};

export const preparesOf = (worker: ReturnType<typeof createWorker>) =>
	worker.events.filter((event) => event.startsWith(`${worker.name}:prepare:`))
		.length;
