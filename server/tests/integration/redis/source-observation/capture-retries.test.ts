import { afterAll, beforeEach, expect, test } from "bun:test";
import { createObservationFixture } from "./utils/observationFixture.js";

const fixture = createObservationFixture({ name: "retries" });
beforeEach(async () => {
	await fixture.reset();
	await fixture.seed();
});
afterAll(fixture.close);

test("a duplicate returns its original observation even after the epoch changes", async () => {
	const first = await fixture.run({ requestId: "retry" });
	const marker = fixture.markerKey({ requestId: "retry" });
	expect(JSON.parse((await fixture.redis.get(marker))!)).toEqual(
		first.observation,
	);
	const markerTtl = await fixture.redis.pttl(marker);
	expect(markerTtl).toBeGreaterThan(86_390_000);
	expect(markerTtl).toBeLessThanOrEqual(86_400_000);
	await fixture.seed({ balance: 50, epoch: 1 });
	const retry = await fixture.run({
		requestId: "retry",
		params: { expected_subject_view_epoch: 1 },
	});
	expect(retry.error).toBe("DUPLICATE_IDEMPOTENCY_KEY");
	expect(retry.observation).toEqual(first.observation);
	expect(
		JSON.parse((await fixture.redis.get(fixture.metadataKey))!).sequence,
	).toBe("1");
	expect(
		JSON.parse((await fixture.redis.hget(fixture.balanceKey(), "messages"))!)
			.balance,
	).toBe(50);
});

test("legacy and malformed markers keep existing dedup semantics without fabricating observations", async () => {
	for (const [marker, reason] of [
		["1", "legacy_receipt"],
		["broken", "receipt_invalid"],
	]) {
		await fixture.redis.set(
			fixture.markerKey({ requestId: "old" }),
			marker,
			"PX",
			10_000,
		);
		const result = await fixture.run({ requestId: "old" });
		expect(result).toMatchObject({
			error: "DUPLICATE_IDEMPOTENCY_KEY",
			observation_error: reason,
		});
		expect(result.observation).toBeUndefined();
		expect(await fixture.redis.exists(fixture.metadataKey)).toBe(0);
	}
});

test("rejections do not consume the live idempotency key and a retry can re-evaluate", async () => {
	const first = await fixture.run({ requestId: "rejected", value: 20 });
	expect(first.observation?.decision).toBe("rejected");
	expect(
		await fixture.redis.exists(fixture.markerKey({ requestId: "rejected" })),
	).toBe(0);
	const second = await fixture.run({ requestId: "rejected", value: 5 });
	expect(second.observation).toMatchObject({
		sequence: "2",
		decision: "applied",
		before: { balance: 10 },
		after: { balance: 5 },
	});
});
