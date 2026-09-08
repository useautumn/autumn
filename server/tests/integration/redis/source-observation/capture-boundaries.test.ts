import { afterAll, beforeEach, expect, test } from "bun:test";
import { balanceObservationSchema } from "@/internal/balances/shadow/balanceObservation.js";
import { createObservationFixture } from "./utils/observationFixture.js";

const fixture = createObservationFixture({ name: "boundaries" });
beforeEach(async () => {
	await fixture.reset();
	await fixture.seed();
});
afterAll(fixture.close);

test("stale epochs, absent balances, and existing locks allocate no sequence", async () => {
	const stale = await fixture.run({
		params: { expected_subject_view_epoch: 5 },
	});
	expect(stale.error).toBe("SUBJECT_VIEW_CHANGED");
	await fixture.redis.del(fixture.balanceKey());
	const absent = await fixture.run();
	expect(absent.error).toBe("SUBJECT_BALANCE_NOT_FOUND");
	await fixture.seed();
	await fixture.redis.set(
		fixture.lockKey,
		JSON.stringify({ status: "pending", deductions: [] }),
	);
	const locked = await fixture.run({
		kind: "reserve",
		params: { lock: { enabled: true } },
	});
	expect(locked.error).toBe("LOCK_ALREADY_EXISTS");
	for (const result of [stale, absent, locked])
		expect(result.observation).toBeUndefined();
	expect(await fixture.redis.exists(fixture.metadataKey)).toBe(0);
});

test("excluded-feature skips share customer ordering without carrying a balance", async () => {
	await fixture.seed({ featureId: "excluded" });
	const first = await fixture.run();
	const excluded = await fixture.run({ featureId: "excluded", kind: "skip" });
	const last = await fixture.run();
	expect(first.observation?.sequence).toBe("1");
	expect(excluded.observation).toMatchObject({
		sequence: "2",
		kind: "skip",
		before: null,
		after: null,
	});
	expect(last.observation).toMatchObject({
		sequence: "3",
		before: { balance: 5 },
		after: { balance: 0 },
	});
});

test("negative live balances produce a named unsupported decision, never a clamped baseline", async () => {
	await fixture.seed({ balance: -3 });
	const result = await fixture.run();
	expect(result.error).toBe("INSUFFICIENT_BALANCE");
	expect(result.observation).toMatchObject({
		kind: "unsupported",
		reason: "balance_shape_not_supported",
		before: null,
		after: null,
	});
	expect(balanceObservationSchema.safeParse(result.observation).success).toBe(
		true,
	);
});
