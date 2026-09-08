import { afterAll, beforeEach, expect, test } from "bun:test";
import { createObservationFixture } from "./utils/observationFixture.js";

const fixture = createObservationFixture({ name: "decisions" });
beforeEach(async () => {
	await fixture.reset();
	await fixture.seed();
});
afterAll(fixture.close);

test("concurrent decisions carry ordered atomic cuts, including rejection", async () => {
	const results = await Promise.all(
		["first", "second", "third"].map((requestId) => fixture.run({ requestId })),
	);
	const observations = results.map((result) => result.observation);
	expect(observations).toMatchObject([
		{
			sequence: "1",
			kind: "deduct",
			decision: "applied",
			before: { balance: 10 },
			after: { balance: 5 },
		},
		{
			sequence: "2",
			kind: "deduct",
			decision: "applied",
			before: { balance: 5 },
			after: { balance: 0 },
		},
		{
			sequence: "3",
			kind: "deduct",
			decision: "rejected",
			before: { balance: 0 },
			after: { balance: 0 },
		},
	]);
	expect(
		new Set(observations.map((observation) => observation?.incarnation)).size,
	).toBe(1);
	expect(results[2].error).toBe("INSUFFICIENT_BALANCE");
	expect(
		await fixture.redis.get(fixture.markerKey({ requestId: "third" })),
	).toBeNull();
});

test("zero caps and fractional cuts retain the real balance", async () => {
	await fixture.seed({ balance: 0.75 });
	const first = await fixture.run({ value: 0.25 });
	const capped = await fixture.run({
		value: 1,
		params: { overage_behaviour: "cap" },
	});
	const empty = await fixture.run({
		value: 1,
		params: { overage_behaviour: "cap" },
	});
	expect(first.observation).toMatchObject({
		before: { balance: 0.75 },
		after: { balance: 0.5 },
	});
	expect(capped.observation).toMatchObject({
		decision: "capped",
		before: { balance: 0.5 },
		after: { balance: 0 },
	});
	expect(empty.observation).toMatchObject({
		decision: "capped",
		before: { balance: 0 },
		after: { balance: 0 },
	});
});

test("disabled capture preserves the live result and one-byte marker", async () => {
	const off = await fixture.run({ requestId: "off", capture: false });
	expect(off.observation).toBeUndefined();
	expect(await fixture.redis.exists(fixture.metadataKey)).toBe(0);
	expect(await fixture.redis.get(fixture.markerKey({ requestId: "off" }))).toBe(
		"1",
	);
	await fixture.seed();
	const { observation, ...on } = await fixture.run({ requestId: "on" });
	expect(on).toEqual(off);
	expect(observation).toMatchObject({
		schemaVersion: 1,
		epoch: 0,
		requestId: "on",
		kind: "deduct",
	});
});
