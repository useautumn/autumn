/**
 * TDD test for: customer.subscription.created auto-sync inserting a duplicate
 * cus_product when the originating Autumn-managed Stripe Checkout Session is
 * completed >10 minutes after Autumn issued it (legacy stripe_checkout /
 * deferred V2 flow).
 *
 * Red-failure mode (current behavior):
 *  - subscription.metadata has `autumn_managed_source` set (Autumn explicitly
 *    owns this sub) but `autumn_managed_at` is older than
 *    RECENT_AUTUMN_ACTION_WINDOW_MS (10 min).
 *  - `isAutumnManagedSubscriptionMetadata` returns { skip: false } because the
 *    time window has expired, so `shouldSkipSubscriptionSync` doesn't short-
 *    circuit the customer.subscription.created handler. Auto-sync runs and
 *    inserts a duplicate cus_product on top of the one inserted by the
 *    parallel checkout.session.completed handler.
 *
 * Green-success criteria (after fix):
 *  - When `autumn_managed_source` is set, the helper returns { skip: true }
 *    regardless of how stale `autumn_managed_at` is. The time window remains
 *    as a fallback only for metadata that has `managedAt` without
 *    `managedSource`.
 *
 * Real-world repro: snowseo customer 5e7f8a1c-ca90-4899-acee-5f88894842f6
 * issued a Stripe Checkout Session at 08:23 UTC (autumn_managed_at stamped
 * then), then completed checkout at 08:52 UTC. customer.subscription.created
 * saw managedAt 29 min stale, the guard returned skip:false, and autoSync ran
 * — producing a 2nd Starter cus_product on top of the one inserted by
 * checkout.session.completed.
 */

import { describe, expect, test } from "bun:test";
import { ms } from "@autumn/shared";
import {
	AUTUMN_STRIPE_METADATA_KEYS,
	RECENT_AUTUMN_ACTION_WINDOW_MS,
	isAutumnManagedSubscriptionMetadata,
} from "@/internal/billing/v2/providers/stripe/utils/common/autumnStripeMetadata";

describe("isAutumnManagedSubscriptionMetadata", () => {
	const NOW = 1_800_000_000_000; // arbitrary fixed "now"

	test("RED: skips when autumn_managed_source is set even if managedAt is older than the 10-min window", () => {
		// Snowseo repro: managedAt stamped at session-creation, sub finally
		// created 29 minutes later when the user completed checkout.
		const stalenessMs = ms.minutes(29);
		const metadata = {
			[AUTUMN_STRIPE_METADATA_KEYS.managedAt]: String(NOW - stalenessMs),
			[AUTUMN_STRIPE_METADATA_KEYS.managedSource]: "attach",
		};

		const result = isAutumnManagedSubscriptionMetadata({
			metadata,
			now: NOW,
		});

		// Pre-fix: skip:false → autoSyncFromSubscription proceeds → duplicate.
		// Post-fix: skip:true because autumn_managed_source is the definitive
		// signal that Autumn owns this subscription, regardless of timing.
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
		// Without an explicit managedSource we have no proof Autumn owns the
		// sub, so the time window remains the only signal — outside the
		// window, fall back to running auto-sync.
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
