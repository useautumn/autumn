import { afterAll, beforeEach, expect, test } from "bun:test";
import { createObservationFixture } from "./utils/observationFixture.js";

const fixture = createObservationFixture({ name: "generation" });
beforeEach(async () => {
	await fixture.reset();
	await fixture.seed({ balance: 100 });
});
afterAll(fixture.close);

test("epoch changes and counter recreation both open a new sequence incarnation", async () => {
	const first = await fixture.run();
	await fixture.seed({ balance: 100, epoch: 1 });
	const second = await fixture.run({
		params: { expected_subject_view_epoch: 1 },
	});
	await fixture.redis.del(fixture.metadataKey);
	const recreated = await fixture.run({
		params: { expected_subject_view_epoch: 1 },
	});
	await fixture.redis.del(fixture.epochKey, fixture.metadataKey);
	await fixture.seed({ balance: 100 });
	const recycledZero = await fixture.run();
	const observations = [first, second, recreated, recycledZero].map(
		(result) => result.observation!,
	);
	expect(observations.map((observation) => observation.sequence)).toEqual([
		"1",
		"1",
		"1",
		"1",
	]);
	expect(observations.map((observation) => observation.epoch)).toEqual([
		0, 1, 1, 0,
	]);
	expect(
		new Set(observations.map((observation) => observation.incarnation)).size,
	).toBe(4);
});

test("counter lifetime never extends the epoch and capture reads it without an expected epoch", async () => {
	await fixture.seed({ balance: 100, epoch: 9, ttl: 30_000 });
	const result = await fixture.run({
		params: { expected_subject_view_epoch: null },
	});
	expect(result.observation?.epoch).toBe(9);
	const [metadataTtl, epochTtl] = (await fixture.redis
		.multi()
		.pttl(fixture.metadataKey)
		.pttl(fixture.epochKey)
		.exec()) as [unknown, number][];
	expect(metadataTtl[1]).toBeGreaterThan(0);
	expect(metadataTtl[1]).toBeLessThan(epochTtl[1]);
});

test("missing epochs and broken counters lose capture but never the production deduction", async () => {
	for (const failure of [
		"epoch_missing",
		"metadata_invalid",
		"capture_failed",
	]) {
		await fixture.reset();
		await fixture.seed();
		if (failure === "epoch_missing") await fixture.redis.del(fixture.epochKey);
		else if (failure === "metadata_invalid")
			await fixture.redis.set(fixture.metadataKey, "bad json");
		else await fixture.redis.hset(fixture.metadataKey, "wrong", "type");
		const result = await fixture.run({ requestId: failure });
		expect(result).toMatchObject({ error: null, observation_error: failure });
		expect(result.updates.messages.balance).toBe(5);
		expect(result.observation).toBeUndefined();
		expect(
			await fixture.redis.get(fixture.markerKey({ requestId: failure })),
		).toBe("1");
	}
	await fixture.reset();
	await fixture.seed();
	const malformed = await fixture.run({ params: { observation: true } });
	expect(malformed).toMatchObject({
		error: null,
		observation_error: "capture_failed",
	});
	expect(malformed.updates.messages.balance).toBe(5);
});
