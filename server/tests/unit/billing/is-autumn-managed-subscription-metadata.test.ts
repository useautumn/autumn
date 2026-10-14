import { describe, expect, test } from "bun:test";
import { ms } from "@autumn/shared";
import {
	AUTUMN_STRIPE_METADATA_KEYS,
	isAutumnManagedSubscriptionMetadata,
	RECENT_AUTUMN_ACTION_WINDOW_MS,
} from "@/internal/billing/v2/providers/stripe/utils/common/autumnStripeMetadata";

describe("isAutumnManagedSubscriptionMetadata", () => {
	const NOW = 1_800_000_000_000;

	test("RED: skips when autumn_managed_source is set even if managedAt is older than the 10-min window", () => {
		const stalenessMs = ms.minutes(29);
		const metadata = {
			[AUTUMN_STRIPE_METADATA_KEYS.managedAt]: String(NOW - stalenessMs),
			[AUTUMN_STRIPE_METADATA_KEYS.managedSource]: "attach",
		};

		const result = isAutumnManagedSubscriptionMetadata({
			metadata,
			now: NOW,
		});

		expect(result.skip).toBe(true);
		expect(result.reason).toContain("attach");
	});

	test("skips when autumn_managed_source is set with a fresh managedAt (regression)", () => {
		const metadata = {
			[AUTUMN_STRIPE_METADATA_KEYS.managedAt]: String(NOW - ms.seconds(30)),
			[AUTUMN_STRIPE_METADATA_KEYS.managedSource]: "attach",
		};

		const result = isAutumnManagedSubscriptionMetadata({
			metadata,
			now: NOW,
		});

		expect(result.skip).toBe(true);
	});

	test("skips when only managedAt is set and is fresh (regression — pre-existing behavior)", () => {
		const metadata = {
			[AUTUMN_STRIPE_METADATA_KEYS.managedAt]: String(NOW - ms.seconds(30)),
		};

		const result = isAutumnManagedSubscriptionMetadata({
			metadata,
			now: NOW,
		});

		expect(result.skip).toBe(true);
	});

	test("does NOT skip when only managedAt is set and is stale (regression — pre-existing behavior)", () => {
		const metadata = {
			[AUTUMN_STRIPE_METADATA_KEYS.managedAt]: String(
				NOW - RECENT_AUTUMN_ACTION_WINDOW_MS - ms.seconds(1),
			),
		};

		const result = isAutumnManagedSubscriptionMetadata({
			metadata,
			now: NOW,
		});

		expect(result.skip).toBe(false);
	});

	test("does NOT skip when metadata is empty (regression — pre-existing behavior)", () => {
		const result = isAutumnManagedSubscriptionMetadata({
			metadata: {},
			now: NOW,
		});

		expect(result.skip).toBe(false);
	});

	test("does NOT skip when metadata is null (regression — pre-existing behavior)", () => {
		const result = isAutumnManagedSubscriptionMetadata({
			metadata: null,
			now: NOW,
		});

		expect(result.skip).toBe(false);
	});
});
