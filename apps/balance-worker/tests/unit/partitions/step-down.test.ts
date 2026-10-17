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
