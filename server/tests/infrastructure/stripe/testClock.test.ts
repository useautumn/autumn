import { expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { addMonths } from "date-fns";
import type Stripe from "stripe";
import { advanceTestClock } from "../../utils/stripeUtils";
import { advanceStripeTestClock } from "../../utils/stripeUtils/testClock/advanceStripeTestClock";
import { waitForStripeClockReady } from "../../utils/stripeUtils/testClock/waitForStripeClockReady";
import { createTestWait } from "../../utils/testWait/createTestWait";

const createClockFixture = () => {
	let frozenTime = 100;
	const targets: number[] = [];
	const stripeCli = {
		testHelpers: {
			testClocks: {
				retrieve: async () => ({ status: "ready", frozen_time: frozenTime }),
				advance: async (_id: string, params: { frozen_time: number }) => {
					targets.push(params.frozen_time);
					frozenTime = params.frozen_time;
				},
			},
		},
	} as unknown as Stripe;
	return { stripeCli, targets, testClockId: randomUUID() };
};

test("the legacy caller migration preserves the target and overlaps its existing wait", async () => {
	const fixture = createClockFixture();
	const startingFrom = new Date("2026-01-31T12:00:00.000Z");
	const expectedTarget = addMonths(startingFrom, 1).getTime();
	const retrieve = fixture.stripeCli.testHelpers.testClocks.retrieve;
	fixture.stripeCli.testHelpers.testClocks.retrieve = async (id) => {
		if (fixture.targets.length) await Bun.sleep(300);
		return retrieve(id);
	};
	const target = await advanceTestClock({
		...fixture,
		startingFrom,
		numberOfMonths: 1,
		minimumWaitForSeconds: 0.4,
		timeoutMs: 600,
	});
	expect(target).toBe(expectedTarget);
	expect(fixture.targets).toEqual([expectedTarget / 1000]);
});

test("an aborted clock operation never submits a Stripe request", async () => {
	const fixture = createClockFixture();
	const controller = new AbortController();
	controller.abort(new Error("test cancelled"));
	await expect(
		advanceStripeTestClock({
			...fixture,
			targetSeconds: 200,
			signal: controller.signal,
		}),
	).rejects.toThrow("test cancelled");
	expect(fixture.targets).toEqual([]);
});

test("a terminal clock failure fails immediately without advancing", async () => {
	const fixture = createClockFixture();
	let reads = 0;
	fixture.stripeCli.testHelpers.testClocks.retrieve = async () => {
		reads++;
		return {
			status: "internal_failure",
			frozen_time: 100,
		} as Stripe.Response<Stripe.TestHelpers.TestClock>;
	};
	await expect(
		advanceStripeTestClock({ ...fixture, targetSeconds: 200 }),
	).rejects.toThrow("failed to advance");
	expect(reads).toBe(1);
	expect(fixture.targets).toEqual([]);
});

test("a hung read consumes the operation deadline and cannot later advance", async () => {
	const fixture = createClockFixture();
	const originalRetrieve = fixture.stripeCli.testHelpers.testClocks.retrieve;
	const read =
		Promise.withResolvers<Stripe.Response<Stripe.TestHelpers.TestClock>>();
	fixture.stripeCli.testHelpers.testClocks.retrieve = () => read.promise;
	const started = performance.now();
	await expect(
		advanceStripeTestClock({ ...fixture, targetSeconds: 200, timeoutMs: 30 }),
	).rejects.toThrow("exceeded 30ms");
	expect(performance.now() - started).toBeLessThan(500);
	read.resolve({
		status: "ready",
		frozen_time: 100,
	} as Stripe.Response<Stripe.TestHelpers.TestClock>);
	await Bun.sleep(5);
	expect(fixture.targets).toEqual([]);
	fixture.stripeCli.testHelpers.testClocks.retrieve = originalRetrieve;
	await advanceStripeTestClock({ ...fixture, targetSeconds: 300 });
	expect(fixture.targets).toEqual([300]);
});

test("ready from an earlier advancement does not satisfy the requested target", async () => {
	const fixture = createClockFixture();
	let reads = 0;
	fixture.stripeCli.testHelpers.testClocks.retrieve = async () =>
		({
			status: "ready",
			frozen_time: ++reads === 1 ? 100 : 200,
		}) as Stripe.Response<Stripe.TestHelpers.TestClock>;
	const wait = createTestWait({
		timeoutMs: 5000,
		description: "target readiness",
	});
	try {
		const clock = await waitForStripeClockReady({
			...fixture,
			targetSeconds: 200,
			wait,
		});
		expect(clock.frozen_time).toBe(200);
		expect(reads).toBe(2);
	} finally {
		wait.close();
	}
});

test("same-clock advances serialize while another clock continues", async () => {
	const fixture = createClockFixture();
	const other = createClockFixture();
	const releaseRead = Promise.withResolvers<void>();
	const originalRetrieve =
		fixture.stripeCli.testHelpers.testClocks.retrieve.bind(
			fixture.stripeCli.testHelpers.testClocks,
		);
	fixture.stripeCli.testHelpers.testClocks.retrieve = async (id) => {
		await releaseRead.promise;
		return originalRetrieve(id);
	};
	const first = advanceStripeTestClock({ ...fixture, targetSeconds: 200 });
	const second = advanceStripeTestClock({ ...fixture, targetSeconds: 300 });
	await advanceStripeTestClock({ ...other, targetSeconds: 200 });
	expect(other.targets).toEqual([200]);
	expect(fixture.targets).toEqual([]);
	releaseRead.resolve();
	await Promise.all([first, second]);
	expect(fixture.targets).toEqual([200, 300]);
});

test("cancellation interrupts readiness sleep without another read", async () => {
	const fixture = createClockFixture();
	const firstRead = Promise.withResolvers<void>();
	let reads = 0;
	fixture.stripeCli.testHelpers.testClocks.retrieve = async () => {
		reads++;
		firstRead.resolve();
		return {
			status: "advancing",
			frozen_time: 100,
		} as Stripe.Response<Stripe.TestHelpers.TestClock>;
	};
	const controller = new AbortController();
	const pending = advanceStripeTestClock({
		...fixture,
		targetSeconds: 200,
		signal: controller.signal,
	});
	await firstRead.promise;
	controller.abort(new Error("test cancelled"));
	await expect(pending).rejects.toThrow();
	expect(reads).toBe(1);
	expect(fixture.targets).toEqual([]);
});

test("cancelling a queued advance neither submits it nor releases the active clock", async () => {
	const fixture = createClockFixture();
	const releaseRead = Promise.withResolvers<void>();
	const originalRetrieve = fixture.stripeCli.testHelpers.testClocks.retrieve;
	fixture.stripeCli.testHelpers.testClocks.retrieve = async (id) => {
		await releaseRead.promise;
		return originalRetrieve(id);
	};
	const active = advanceStripeTestClock({ ...fixture, targetSeconds: 200 });
	const controller = new AbortController();
	const cancelled = advanceStripeTestClock({
		...fixture,
		targetSeconds: 300,
		signal: controller.signal,
	});
	controller.abort(new Error("queued test cancelled"));
	await expect(cancelled).rejects.toThrow("queued test cancelled");
	const next = advanceStripeTestClock({ ...fixture, targetSeconds: 400 });
	expect(fixture.targets).toEqual([]);
	releaseRead.resolve();
	await Promise.all([active, next]);
	expect(fixture.targets).toEqual([200, 400]);
});

test("an interrupted write prevents later advances even if its response arrives late", async () => {
	const fixture = createClockFixture();
	const submitted = Promise.withResolvers<void>();
	const response =
		Promise.withResolvers<Stripe.Response<Stripe.TestHelpers.TestClock>>();
	let writes = 0;
	fixture.stripeCli.testHelpers.testClocks.advance = () => {
		writes++;
		submitted.resolve();
		return response.promise;
	};
	const controller = new AbortController();
	const first = advanceStripeTestClock({
		...fixture,
		targetSeconds: 200,
		signal: controller.signal,
	});
	await submitted.promise;
	controller.abort(new Error("write cancelled"));
	await expect(first).rejects.toThrow("write cancelled");
	response.resolve({
		status: "ready",
		frozen_time: 200,
	} as Stripe.Response<Stripe.TestHelpers.TestClock>);
	await expect(
		advanceStripeTestClock({ ...fixture, targetSeconds: 300 }),
	).rejects.toThrow("unresolved advancement");
	expect(writes).toBe(1);
});

test("the minimum webhook wait overlaps clock readiness instead of stacking", async () => {
	const fixture = createClockFixture();
	const retrieve = fixture.stripeCli.testHelpers.testClocks.retrieve;
	fixture.stripeCli.testHelpers.testClocks.retrieve = async (id) => {
		if (fixture.targets.length > 0) await Bun.sleep(600);
		return retrieve(id);
	};
	const startedAt = performance.now();
	await advanceStripeTestClock({
		...fixture,
		targetSeconds: 200,
		minimumWaitMs: 800,
		timeoutMs: 1_200,
	});
	expect(performance.now() - startedAt).toBeGreaterThanOrEqual(790);
	expect(fixture.targets).toEqual([200]);
});

test("an elapsed minimum wait cannot replace clock readiness", async () => {
	const fixture = createClockFixture();
	const retrieve = fixture.stripeCli.testHelpers.testClocks.retrieve;
	const releaseRead = Promise.withResolvers<void>();
	fixture.stripeCli.testHelpers.testClocks.retrieve = async (id) => {
		if (fixture.targets.length > 0) await releaseRead.promise;
		return retrieve(id);
	};
	let finished = false;
	const pending = advanceStripeTestClock({
		...fixture,
		targetSeconds: 200,
		minimumWaitMs: 20,
	}).then(() => {
		finished = true;
	});
	try {
		await Bun.sleep(50);
		expect(fixture.targets).toEqual([200]);
		expect(finished).toBe(false);
	} finally {
		releaseRead.resolve();
		await pending;
	}
	expect(finished).toBe(true);
});

test("the operation deadline bounds the minimum webhook wait", async () => {
	const fixture = createClockFixture();
	await expect(
		advanceStripeTestClock({
			...fixture,
			targetSeconds: 200,
			minimumWaitMs: 10_000,
			timeoutMs: 30,
		}),
	).rejects.toThrow("exceeded 30ms");
	expect(fixture.targets).toEqual([200]);
});

test("cancellation interrupts the minimum webhook wait", async () => {
	const fixture = createClockFixture();
	const controller = new AbortController();
	const pending = advanceStripeTestClock({
		...fixture,
		targetSeconds: 200,
		minimumWaitMs: 10_000,
		signal: controller.signal,
	});
	await Bun.sleep(10);
	controller.abort(new Error("test cancelled"));
	await expect(pending).rejects.toThrow("test cancelled");
	expect(fixture.targets).toEqual([200]);
});
