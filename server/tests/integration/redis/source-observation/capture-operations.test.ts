import { afterAll, beforeEach, expect, test } from "bun:test";
import { createObservationFixture } from "./utils/observationFixture.js";

const fixture = createObservationFixture({ name: "operations" });
beforeEach(async () => {
	await fixture.reset();
	await fixture.seed();
});
afterAll(fixture.close);

test("set, refund and granted adjustments retain live parity without claiming worker support", async () => {
	for (const [kind, value, params] of [
		["set", 0, { target_balance: 7 }],
		["refund", -3, {}],
		["adjust", 2, { alter_granted_balance: true }],
	] as const) {
		await fixture.seed();
		const off = await fixture.run({ kind, value, params, capture: false });
		const offState = await fixture.redis.hgetall(fixture.balanceKey());
		await fixture.seed();
		const { observation, ...on } = await fixture.run({ kind, value, params });
		expect(on).toEqual(off);
		expect(await fixture.redis.hgetall(fixture.balanceKey())).toEqual(offState);
		expect(observation).toMatchObject({ kind, before: null, after: null });
	}
	await fixture.seed();
	const refund = await fixture.run({
		kind: "refund",
		value: -3,
		params: {
			customer_entitlement_deductions: [
				{
					customer_entitlement_id: "messages",
					feature_id: "messages",
					credit_cost: 1,
					usage_allowed: false,
					max_balance: 10,
				},
			],
		},
	});
	expect(refund.remaining).toBe(-3);
	expect(refund.observation).toMatchObject({
		kind: "refund",
		decision: "capped",
	});
});

test("reservation, zero-delta finalize, and unwind are distinct decisions", async () => {
	const reserve = await fixture.run({
		requestId: "reserve",
		kind: "reserve",
		params: { lock: { enabled: true } },
	});
	expect(reserve.observation).toMatchObject({
		sequence: "1",
		kind: "reserve",
		decision: "applied",
	});
	const finalize = await fixture.run({
		requestId: "finalize",
		kind: "finalize",
		value: 0,
		params: { unwind_value: 0 },
	});
	expect(finalize.observation).toMatchObject({
		sequence: "2",
		kind: "finalize",
		decision: "applied",
	});
	const unwind = await fixture.run({
		requestId: "unwind",
		kind: "unwind",
		value: 0,
		params: { unwind_value: 2 },
	});
	expect(unwind.error).toBeNull();
	expect(unwind.observation).toMatchObject({
		sequence: "3",
		kind: "unwind",
		before: null,
		after: null,
	});
	expect(unwind.updates.messages.balance).toBe(7);
});

test("a rejected reservation cannot be mistaken for a rejected direct track", async () => {
	const result = await fixture.run({
		kind: "reserve",
		value: 20,
		params: { lock: { enabled: true } },
	});
	expect(result.observation).toMatchObject({
		kind: "reserve",
		decision: "rejected",
		before: null,
		after: null,
	});
	expect(await fixture.redis.exists(fixture.lockKey)).toBe(0);
});
