import { describe, expect, test } from "bun:test";
import { RecaseError } from "@autumn/shared";
import { assertSyncPhasesStartAfterNow } from "@/internal/billing/v2/actions/sync/errors/assertSyncPhasesStartAfterNow";

const NOW = 1_900_000_000_000;
const DAY_MS = 24 * 60 * 60 * 1000;

const assertFor = ({
	laterStartsAt,
	firstStartsAt = "now",
}: {
	laterStartsAt: number;
	firstStartsAt?: number | "now";
}) =>
	assertSyncPhasesStartAfterNow({
		phases: [
			{ starts_at: firstStartsAt, plans: [] },
			{ starts_at: laterStartsAt, plans: [] },
		],
		currentEpochMs: NOW,
	});

describe("assertSyncPhasesStartAfterNow", () => {
	test("rejects a phase after 'now' that already started", () => {
		expect(() => assertFor({ laterStartsAt: NOW - DAY_MS })).toThrow(
			RecaseError,
		);
	});

	test("accepts a phase after 'now' that starts later", () => {
		expect(() => assertFor({ laterStartsAt: NOW + DAY_MS })).not.toThrow();
	});

	test("leaves phases without a 'now' phase alone", () => {
		expect(() =>
			assertFor({
				laterStartsAt: NOW - DAY_MS,
				firstStartsAt: NOW - 2 * DAY_MS,
			}),
		).not.toThrow();
	});
});
