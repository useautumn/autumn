import { describe, expect, test } from "bun:test";
import {
	createOwnershipLog,
	createWorker,
	deferred,
	ownAlone,
	waitFor,
} from "./handoffFixtures.js";

describe("stepping down", () => {
	test("closes every route at once, leaves the group before the consumer stops, and hands nothing off", async () => {
		const log = createOwnershipLog();
		const A = createWorker({ name: "a", log });
		await ownAlone(A, [0, 1]);
		expect(A.ownership.isAdmitted({ partition: 0 })).toBe(true);
		const steppingDown = A.ownership.stepDown();
		expect(A.ownership.isSteppedDown()).toBe(true);
		expect(A.ownership.isAdmitted({ partition: 0 })).toBe(false);
		expect(A.ownership.isAdmitted({ partition: 1 })).toBe(false);
		await steppingDown;
		expect(A.index("consumer-leave")).toBeGreaterThanOrEqual(0);
		expect(A.index("consumer-leave")).toBeLessThan(A.index("consumer-stop"));
		expect(A.has("release:0")).toBe(true);
		expect(A.has("release:1")).toBe(true);
		expect(A.has("stop:0")).toBe(true);
		expect(A.has("draining:0")).toBe(false);
		expect(A.stopped).toEqual([]);
	});

	test("a partition already handing off stops serving at once instead of waiting for a successor", async () => {
		const log = createOwnershipLog();
		const A = createWorker({
			name: "a",
			log,
			config: { handoffReadyTimeoutMs: 60_000 },
		});
		await ownAlone(A, [0]);
		A.revoke();
		expect(A.ownership.isAdmitted({ partition: 0 })).toBe(true);
		void A.ownership.stepDown();
		expect(A.ownership.isAdmitted({ partition: 0 })).toBe(false);
	});

	test("a handoff already draining when the worker steps down releases instead of naming its successor", async () => {
		const log = createOwnershipLog();
		const drainGate = deferred();
		const A = createWorker({
			name: "a",
			log,
			drainGate: drainGate.promise,
			config: { handoffReadyTimeoutMs: 60_000 },
		});
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
		const steppingDown = A.ownership.stepDown();
		drainGate.resolve();
		await steppingDown;
		await waitFor(() => A.has("stop:0"));
		expect(A.has("claim:b:0")).toBe(false);
		expect(A.has("release:0")).toBe(true);
		await waitFor(() => B.has("claim:b:0"));
	});

	test("a request waiting on a handoff is let go the moment the worker steps down", async () => {
		const log = createOwnershipLog();
		const drainGate = deferred();
		const A = createWorker({
			name: "a",
			log,
			drainGate: drainGate.promise,
			config: { handoffReadyTimeoutMs: 60_000 },
		});
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
		const released = { value: false };
		void A.ownership.awaitHandoff({ partition: 0 }).then(() => {
			released.value = true;
		});
		await Bun.sleep(20);
		expect(released.value).toBe(false);
		const steppingDown = A.ownership.stepDown();
		await waitFor(() => released.value);
		drainGate.resolve();
		await steppingDown;
	});

	test("a step-down while the service is already stopping still keeps the process up", async () => {
		const log = createOwnershipLog();
		const A = createWorker({ name: "a", log });
		await ownAlone(A, [0]);
		A.crash(new Error("the client gave up"));
		await Promise.resolve();
		await Promise.resolve();
		const steppingDown = A.ownership.stepDown();
		await steppingDown;
		await Bun.sleep(10);
		expect(A.ownership.isSteppedDown()).toBe(true);
		expect(A.stopped).toEqual([]);
	});

	test("a retirement that fails after the step-down never asks the process to stop", async () => {
		const log = createOwnershipLog();
		const drainGate = deferred();
		const A = createWorker({
			name: "a",
			log,
			drainGate: drainGate.promise,
			stopFailures: new Map([[0, new Error("stop failed")]]),
		});
		await ownAlone(A, [0, 1]);
		A.assign([1]);
		await waitFor(() => A.has("withdraw:0"));
		const steppingDown = A.ownership.stepDown();
		drainGate.resolve();
		await steppingDown;
		await waitFor(() => A.has("stop:0"));
		await Bun.sleep(10);
		expect(A.stopped).toEqual([]);
	});
});
