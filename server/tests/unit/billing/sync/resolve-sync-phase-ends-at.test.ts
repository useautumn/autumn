import { describe, expect, test } from "bun:test";
import { resolveSyncPhaseEndsAt } from "@/internal/billing/v2/actions/sync/setup/resolveSyncPhaseEndsAt";

const YEAR_MS = 365 * 24 * 60 * 60 * 1000;
const STARTS_AT = 1_900_000_000_000;

describe("resolveSyncPhaseEndsAt", () => {
	test("a phase ends where the next one starts", () => {
		expect(
			resolveSyncPhaseEndsAt({
				startsAt: STARTS_AT,
				nextPhaseStartsAt: STARTS_AT + YEAR_MS,
				releaseTailStartsAt: STARTS_AT + 2 * YEAR_MS,
			}),
		).toBe(STARTS_AT + YEAR_MS);
	});

	test("the last phase ends where Stripe's release tail starts", () => {
		expect(
			resolveSyncPhaseEndsAt({
				startsAt: STARTS_AT,
				nextPhaseStartsAt: null,
				releaseTailStartsAt: STARTS_AT + YEAR_MS,
			}),
		).toBe(STARTS_AT + YEAR_MS);
	});

	test("the last phase stays open-ended with no release tail", () => {
		expect(
			resolveSyncPhaseEndsAt({
				startsAt: STARTS_AT,
				nextPhaseStartsAt: null,
				releaseTailStartsAt: null,
			}),
		).toBeNull();
	});

	test("a release tail at or before the phase start doesn't end it", () => {
		expect(
			resolveSyncPhaseEndsAt({
				startsAt: STARTS_AT,
				nextPhaseStartsAt: null,
				releaseTailStartsAt: STARTS_AT,
			}),
		).toBeNull();
	});
});
