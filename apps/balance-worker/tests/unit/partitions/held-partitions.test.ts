import { describe, expect, test } from "bun:test";
import {
	createOwnershipLog,
	createWorker,
	deferred,
	ownAlone,
	waitFor,
} from "./handoffFixtures.js";

describe("held partitions", () => {
	test("a partition is held from its assignment, while it still fences and before it is admitted", async () => {
		const log = createOwnershipLog();
		const fenceGate = deferred();
		const A = createWorker({ name: "a", log, fenceGate: fenceGate.promise });
		await A.ownership.start();
		A.assign([0]);
		await Bun.sleep(20);
		expect(A.ownership.isAdmitted({ partition: 0 })).toBe(false);
		expect(A.ownership.holdingOf({ partition: 0 })).toBeDefined();
		expect(A.ownership.holdingOf({ partition: 1 })).toBeUndefined();
		fenceGate.resolve();
		await waitFor(() => A.ownership.isAdmitted({ partition: 0 }));
		expect(A.ownership.holdingOf({ partition: 0 })).toBeDefined();
	});

	test("a partition whose runtime failed stays held while it waits to retry", async () => {
		const log = createOwnershipLog();
		const A = createWorker({ name: "a", log });
		await ownAlone(A, [0]);
		A.fail(0, new Error("runtime failed"));
		await waitFor(() => !A.ownership.isAdmitted({ partition: 0 }));
		expect(A.ownership.holdingOf({ partition: 0 })).toBeDefined();
	});

	test("a revoked partition is held while it hands off and let go once its successor takes it", async () => {
		const log = createOwnershipLog();
		const drainGate = deferred();
		const A = createWorker({ name: "a", log, drainGate: drainGate.promise });
		const B = createWorker({
			name: "b",
			log,
			config: { handoffClaimTimeoutMs: 20, handoffDrainCapMs: 20 },
		});
		await ownAlone(A, [0]);
		await B.ownership.start();
		A.revoke();
		B.assign([0]);
		await waitFor(() => A.has("withdraw:0"));
		expect(A.ownership.holdingOf({ partition: 0 })).toBeDefined();
		drainGate.resolve();
		await waitFor(() => A.ownership.holdingOf({ partition: 0 }) === undefined, 2_000);
		await waitFor(() => B.ownership.holdingOf({ partition: 0 }) !== undefined);
	});

	test("a partition keeps its holding while it stays held, through a revoke into a handoff and back", async () => {
		const log = createOwnershipLog();
		const A = createWorker({
			name: "a",
			log,
			config: { handoffReadyTimeoutMs: 60_000 },
		});
		await ownAlone(A, [0]);
		const holding = A.ownership.holdingOf({ partition: 0 });
		expect(holding).toBeDefined();
		A.revoke();
		expect(A.ownership.holdingOf({ partition: 0 })).toBe(holding);
		A.assign([0]);
		expect(A.ownership.holdingOf({ partition: 0 })).toBe(holding);
	});

	test("a partition let go and taken again gets a new holding", async () => {
		const log = createOwnershipLog();
		const A = createWorker({ name: "a", log });
		const B = createWorker({
			name: "b",
			log,
			config: { handoffClaimTimeoutMs: 20, handoffDrainCapMs: 20 },
		});
		await ownAlone(A, [0]);
		const first = A.ownership.holdingOf({ partition: 0 });
		await B.ownership.start();
		A.revoke();
		B.assign([0]);
		await waitFor(
			() => A.ownership.holdingOf({ partition: 0 }) === undefined,
			2_000,
		);
		A.assign([0]);
		const second = A.ownership.holdingOf({ partition: 0 });
		expect(second).toBeDefined();
		expect(second).not.toBe(first);
	});
});
