/**
 * Some orgs have findings they have already reviewed and accepted. Mobbin runs
 * Stripe schedules whose only future change is a quantity step — the
 * subscription webhook applies it, so Autumn holds no phase for it by design,
 * and verify's unexpected_schedule is noise for them.
 */

import { describe, expect, it } from "bun:test";
import type { SubscriptionMismatch } from "@autumn/shared";
import { isIgnoredVerifyMismatch } from "@/internal/billing/v2/actions/verify/ignoredVerifyMismatches.js";

const CONFIGURED_ORG_ID = "J5DBNq2fVFPh3Od7QhKltZuRwihXHOCy";
const OTHER_ORG_ID = "org_without_overrides";

const scheduleMismatch = (reason: string) =>
	({ type: "schedule_mismatch", reason }) as unknown as SubscriptionMismatch;

describe("isIgnoredVerifyMismatch", () => {
	it("ignores the configured reason for the configured org", () => {
		expect(
			isIgnoredVerifyMismatch({
				orgId: CONFIGURED_ORG_ID,
				mismatch: scheduleMismatch("unexpected_schedule"),
			}),
		).toBe(true);
	});

	it("keeps other reasons of the same type", () => {
		for (const reason of ["missing_schedule", "phase_count_mismatch"]) {
			expect(
				isIgnoredVerifyMismatch({
					orgId: CONFIGURED_ORG_ID,
					mismatch: scheduleMismatch(reason),
				}),
			).toBe(false);
		}
	});

	it("keeps other mismatch types for the configured org", () => {
		expect(
			isIgnoredVerifyMismatch({
				orgId: CONFIGURED_ORG_ID,
				mismatch: { type: "stale_subscription_link" } as SubscriptionMismatch,
			}),
		).toBe(false);
	});

	it("keeps the same finding for every other org", () => {
		expect(
			isIgnoredVerifyMismatch({
				orgId: OTHER_ORG_ID,
				mismatch: scheduleMismatch("unexpected_schedule"),
			}),
		).toBe(false);
	});
});
