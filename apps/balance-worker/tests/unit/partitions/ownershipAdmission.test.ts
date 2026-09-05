import { describe, expect, test } from "bun:test";
import { ownedPartitionHealthOf } from "../../../src/health/ownedPartitionHealth.js";
import { createPartitions } from "../../../src/partitions/createPartitions.js";
import type {
	PartitionChangeListeners,
	PartitionRuntimeFactory,
} from "../../../src/partitions/types/partitions.js";

const deferred = () => {
	let resolve = (): void => undefined;
	const promise = new Promise<void>((settle) => {
		resolve = settle;
	});
	return { promise, resolve };
};
const waitFor = async (condition: () => boolean) => {
	for (let attempt = 0; attempt < 100; attempt++) {
		if (condition()) return;
		await Bun.sleep(1);
	}
	throw new Error("Condition was not reached");
};

const fixture = ({
	quiescenceGate,
	quiescenceError,
	drainError,
	failAfterClaim = false,
	startGate,
	claimGate,
	drainGate,
	claimError,
	releaseError,
	unready = false,
}: {
	quiescenceGate?: Promise<void>;
	quiescenceError?: Error;
	drainError?: Error;
	failAfterClaim?: boolean;
	startGate?: Promise<void>;
	claimGate?: Promise<void>;
	drainGate?: Promise<void>;
	claimError?: Error;
	releaseError?: Error;
	unready?: boolean;
} = {}) => {
	const events: string[] = [];
	const errors: unknown[] = [];
	let listeners: PartitionChangeListeners;
	const runtimes = new Map<number, ReturnType<PartitionRuntimeFactory>>();
	let epoch = 100;
	const createRuntime: PartitionRuntimeFactory = ({ partition }) => {
		let status:
			| "created"
			| "ready"
			| "draining"
			| "recovery_required"
			| "stopped" = "created";
		const unavailableListeners = new Set<
			(failure: { cause: unknown }) => void
		>();
		const getHealth = () =>
			ownedPartitionHealthOf({
				topic: "metering",
				partition,
				status,
				localNextOffset: 0n,
				consumedNextOffset: 0n,
				highWatermark: 0n,
				failureReason: status === "recovery_required" ? "failed" : null,
			});
		const runtime = {
			start: async () => {
				events.push(`start:${partition}`);
				await startGate;
				if (status !== "created") throw new Error("startup cancelled");
				if (!unready) status = "ready";
				events.push(`ready:${partition}`);
			},
			drain: async () => {
				events.push(`gate-closed:${partition}`);
				if (status === "recovery_required")
					throw new Error("recovery cannot release");
				status = "draining";
				await drainGate;
				if (drainError) throw drainError;
				events.push(`applied:${partition}`);
			},
			stop: async () => {
				status = "stopped";
				events.push(`disconnect:${partition}`);
			},
			waitForQuiescence: async () => {
				await quiescenceGate;
				if (quiescenceError) throw quiescenceError;
			},
			getHealth,
			subscribeUnavailable: (
				listener: (failure: { cause: unknown }) => void,
			) => {
				unavailableListeners.add(listener);
				return () => {
					unavailableListeners.delete(listener);
				};
			},
			submitTrack: async () => {
				throw new Error("No command fixture");
			},
			check: async () => {
				throw new Error("No command fixture");
			},
		};
		const resources = {
			runtime,
			markUnavailable: () => undefined,
			publication: {
				claim: async () => {
					events.push(`claim:${partition}`);
					await claimGate;
					if (claimError) throw claimError;
					events.push(`claimed:${partition}`);
					if (failAfterClaim) status = "recovery_required";
					return { routeEpoch: String(epoch++) };
				},
				release: async () => {
					events.push(`release:${partition}`);
					if (releaseError) throw releaseError;
				},
			},
		};
		runtimes.set(partition, resources);
		failures.set(partition, () => {
			status = "recovery_required";
			for (const listener of unavailableListeners)
				listener({ cause: new Error("runtime failed") });
		});
		return resources;
	};
	const failures = new Map<number, () => void>();
	const ownership = createPartitions({
		config: { topic: "metering", healthRefreshIntervalMs: 60_000 },
		ctx: {
			createRuntime,
			consumer: {
				start: async () => undefined,
				stop: async () => {
					events.push("consumer-stop");
				},
				pause: () => undefined,
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
	const assign = (partitions = [2]) =>
		listeners.onAssigned({ partitions, causeForPartition });
	const revoke = () => listeners.onRevoked({ causeForPartition });
	const fail = (partition = 2) => failures.get(partition)?.();
	return { ownership, events, errors, runtimes, assign, revoke, fail };
};

async function factoryMethodsKeepInstanceStateWhenDetached(): Promise<void> {
	const first = fixture();
	const second = fixture();
	const { start, stop, partitions, findRuntime } = first.ownership;
	const route = { partition: 2, routeEpoch: "100" };

	function bothPartitionsAreReady(): boolean {
		return (
			findRuntime(route) !== undefined &&
			second.ownership.findRuntime(route) !== undefined
		);
	}

	try {
		await start();
		await second.ownership.start();
		first.assign();
		second.assign();
		await waitFor(bothPartitionsAreReady);

		expect(partitions()).toHaveLength(1);
		expect(findRuntime(route)).toBe(first.runtimes.get(2)?.runtime);
		expect(findRuntime(route)).not.toBe(second.ownership.findRuntime(route));

		const stopping = stop();
		expect(stop()).toBe(stopping);
		expect(findRuntime(route)).toBeUndefined();
		await stopping;
		expect(second.ownership.findRuntime(route)).toBe(
			second.runtimes.get(2)?.runtime,
		);
	} finally {
		await stop();
		await second.ownership.stop();
	}
}

test(
	"factory methods keep instance state when detached",
	factoryMethodsKeepInstanceStateWhenDetached,
);

describe("Ownership publication and admission", () => {
	test("ready then claim then admit exact epoch, independently for multiple partitions", async () => {
		const f = fixture();
		await f.ownership.start();
		expect(
			f.ownership.findRuntime({ partition: 2, routeEpoch: "100" }),
		).toBeUndefined();
		f.assign([1, 2]);
		await waitFor(() => f.events.includes("claimed:2"));
		expect(f.ownership.findRuntime({ partition: 1, routeEpoch: "100" })).toBe(
			f.runtimes.get(1)?.runtime,
		);
		expect(f.ownership.findRuntime({ partition: 2, routeEpoch: "101" })).toBe(
			f.runtimes.get(2)?.runtime,
		);
		expect(
			f.ownership.findRuntime({ partition: 2, routeEpoch: "100" }),
		).toBeUndefined();
		expect(
			f.ownership.findRuntime({ partition: 3, routeEpoch: "101" }),
		).toBeUndefined();
		expect(f.events.indexOf("ready:2")).toBeLessThan(
			f.events.indexOf("claim:2"),
		);
		await f.ownership.stop();
	});
	test("does not advertise unready runtimes", async () => {
		const f = fixture({ unready: true });
		await f.ownership.start();
		f.assign();
		await waitFor(() => f.events.includes("ready:2"));
		expect(f.events).not.toContain("claim:2");
		expect(
			f.ownership.findRuntime({ partition: 2, routeEpoch: "100" }),
		).toBeUndefined();
		await f.ownership.stop();
	});
	test("revoke during startup prevents claim and old callbacks cannot admit a replacement", async () => {
		const start = deferred();
		const f = fixture({ startGate: start.promise });
		await f.ownership.start();
		f.assign();
		await waitFor(() => f.events.includes("start:2"));
		f.revoke();
		f.assign([1]);
		start.resolve();
		await waitFor(() => f.events.includes("claimed:1"));
		expect(f.events).not.toContain("claim:2");
		expect(
			f.ownership.findRuntime({ partition: 2, routeEpoch: "100" }),
		).toBeUndefined();
		await f.ownership.stop();
	});
	test("shutdown settles a pending claim before release and disposal without admitting", async () => {
		const claim = deferred();
		const f = fixture({ claimGate: claim.promise });
		await f.ownership.start();
		f.assign();
		await waitFor(() => f.events.includes("claim:2"));
		const stopping = f.ownership.stop();
		expect(f.events).toContain("gate-closed:2");
		expect(f.events).not.toContain("disconnect:2");
		claim.resolve();
		await stopping;
		expect(
			f.ownership.findRuntime({ partition: 2, routeEpoch: "100" }),
		).toBeUndefined();
		expect(f.events.indexOf("claimed:2")).toBeLessThan(
			f.events.indexOf("release:2"),
		);
		expect(f.events.indexOf("release:2")).toBeLessThan(
			f.events.indexOf("disconnect:2"),
		);
	});
	test("withdraws synchronously and waits for accepted local apply before releasing", async () => {
		const drain = deferred();
		const f = fixture({ drainGate: drain.promise });
		await f.ownership.start();
		f.assign();
		await waitFor(() => f.events.includes("claimed:2"));
		f.revoke();
		expect(
			f.ownership.findRuntime({ partition: 2, routeEpoch: "100" }),
		).toBeUndefined();
		expect(f.events).toContain("gate-closed:2");
		expect(f.events).not.toContain("release:2");
		drain.resolve();
		await f.ownership.stop();
		expect(f.events.indexOf("applied:2")).toBeLessThan(
			f.events.indexOf("release:2"),
		);
		expect(f.events.indexOf("release:2")).toBeLessThan(
			f.events.indexOf("disconnect:2"),
		);
	});
	test("runtime recovery immediately withdraws without waiting for the health timer", async () => {
		const f = fixture();
		await f.ownership.start();
		f.assign();
		await waitFor(() => f.events.includes("claimed:2"));
		f.fail();
		expect(
			f.ownership.findRuntime({ partition: 2, routeEpoch: "100" }),
		).toBeUndefined();
		await waitFor(() => f.events.includes("consumer-stop"));
		expect(f.events).not.toContain("release:2");
		await f.ownership.stop();
	});
	for (const message of ["claim rejected", "claim outcome unknown"]) {
		test(`${message} is terminal and never admits or releases`, async () => {
			const f = fixture({ claimError: new Error(message) });
			await f.ownership.start();
			f.assign();
			await waitFor(() => f.events.includes("consumer-stop"));
			expect(
				f.ownership.findRuntime({ partition: 2, routeEpoch: "100" }),
			).toBeUndefined();
			expect(f.events).not.toContain("release:2");
			expect(f.events.filter((event) => event === "claim:2")).toHaveLength(1);
			await f.ownership.stop();
		});
	}
	test("claim completion rechecks runtime health before admission", async () => {
		const f = fixture({ failAfterClaim: true });
		await f.ownership.start();
		f.assign();
		await waitFor(() => f.events.includes("consumer-stop"));
		expect(
			f.ownership.findRuntime({ partition: 2, routeEpoch: "100" }),
		).toBeUndefined();
		expect(f.events).not.toContain("release:2");
		await f.ownership.stop();
	});
	test("reassignment during claim settles the old epoch before admitting its replacement", async () => {
		const claim = deferred();
		const f = fixture({ claimGate: claim.promise });
		await f.ownership.start();
		f.assign();
		await waitFor(() => f.events.includes("claim:2"));
		f.revoke();
		f.assign();
		expect(f.events.filter((event) => event === "start:2")).toHaveLength(1);
		claim.resolve();
		await waitFor(
			() => f.events.filter((event) => event === "claimed:2").length === 2,
		);
		expect(
			f.ownership.findRuntime({ partition: 2, routeEpoch: "100" }),
		).toBeUndefined();
		expect(f.ownership.findRuntime({ partition: 2, routeEpoch: "101" })).toBe(
			f.runtimes.get(2)?.runtime,
		);
		await f.ownership.stop();
	});
	test("failed drain never releases and blocks replacement until callbacks settle", async () => {
		const quiescence = deferred();
		const f = fixture({
			drainError: new Error("drain timed out"),
			quiescenceGate: quiescence.promise,
		});
		await f.ownership.start();
		f.assign();
		await waitFor(() => f.events.includes("claimed:2"));
		f.revoke();
		f.assign([1]);
		await Bun.sleep(1);
		expect(f.events).not.toContain("release:2");
		expect(f.events).not.toContain("start:1");
		quiescence.resolve();
		await waitFor(() => f.events.includes("claimed:1"));
		await f.ownership.stop();
	});
	test("unproven quiescence prevents all later assignments from reusing SQLite", async () => {
		const f = fixture({ quiescenceError: new Error("replay stop failed") });
		await f.ownership.start();
		f.assign();
		await waitFor(() => f.events.includes("claimed:2"));
		f.revoke();
		f.assign([1]);
		await waitFor(() => f.events.includes("consumer-stop"));
		f.assign([1]);
		await Bun.sleep(1);
		expect(f.events).not.toContain("start:1");
		await f.ownership.stop();
	});

	test("release failure still disposes resources", async () => {
		const error = new Error("release failed");
		const f = fixture({ releaseError: error });
		await f.ownership.start();
		f.assign();
		await waitFor(() => f.events.includes("claimed:2"));
		await f.ownership.stop();
		expect(f.events).toContain("disconnect:2");
		expect(f.errors).toContain(error);
	});
});
