import { expect, test } from "bun:test";
import { balanceObservationSchema } from "@/internal/balances/shadow/balanceObservation.js";
import { createCaptureFixture } from "./utils/captureFixture.js";

test("malformed sequences fail validation without throwing", () => {
	const { observation } = createCaptureFixture();
	for (const sequence of [
		"invalid",
		"1e3",
		"0",
		"-1",
		"01",
		"9007199254740992",
	]) {
		expect(
			balanceObservationSchema.safeParse({ ...observation, sequence }).success,
		).toBe(false);
	}
	expect(
		balanceObservationSchema.safeParse({
			...observation,
			sequence: "9007199254740991",
		}).success,
	).toBe(true);
});

test("the observation boundary rejects unknown versions, fields, and invalid balance snapshots", () => {
	const { observation } = createCaptureFixture();
	for (const invalid of [
		{ ...observation, schemaVersion: 2 },
		{ ...observation, extra: true },
		{ ...observation, before: { ...observation.before, balance: -1 } },
		{
			...observation,
			after: { ...observation.after, customerEntitlementId: "other" },
		},
		{ ...observation, before: null },
	])
		expect(balanceObservationSchema.safeParse(invalid).success).toBe(false);
});

test("skips and unsupported operations cannot claim a comparable balance snapshot", () => {
	const { observation } = createCaptureFixture();
	for (const kind of ["skip", "set", "unsupported"]) {
		expect(
			balanceObservationSchema.safeParse({ ...observation, kind }).success,
		).toBe(false);
		expect(
			balanceObservationSchema.safeParse({
				...observation,
				kind,
				before: null,
				after: null,
			}).success,
		).toBe(true);
	}
});
