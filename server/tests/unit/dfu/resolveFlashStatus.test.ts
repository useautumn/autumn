/**
 * Unit tests for resolveFlashStatus — the pure rule behind dfu.flash status.
 * Payload `plan.status` always wins; Stripe hydration only fills gaps. No DB.
 */

import { describe, expect, test } from "bun:test";
import { CusProductStatus, type FlashPlan } from "@autumn/shared";
import { resolveFlashStatus } from "@/internal/billing/v2/actions/dfu/compute/resolvers/statusResolver.js";
import type { StripeHydration } from "@/internal/billing/v2/actions/dfu/setup/hydrate/hydrateStripeBillable.js";

const NOW = 1_700_000_000_000;
const PAST = NOW - 1000;
const FUTURE = NOW + 1000;

const plan = (status?: FlashPlan["status"]): FlashPlan =>
	({ plan_id: "p", status }) as FlashPlan;

describe("resolveFlashStatus", () => {
	test("payload active wins over a hydrated Expired (past end)", () => {
		const hydration: StripeHydration = {
			status: CusProductStatus.Expired,
			endedAt: PAST,
		};
		const result = resolveFlashStatus({ plan: plan("active"), now: NOW, hydration });
		expect(result.status).toBe(CusProductStatus.Active);
		expect(result.canceled).toBe(false);
		expect(result.endedAt).toBeNull();
	});

	test("payload past_due wins", () => {
		const result = resolveFlashStatus({
			plan: plan("past_due"),
			now: NOW,
			hydration: { status: CusProductStatus.Active },
		});
		expect(result.status).toBe(CusProductStatus.PastDue);
		expect(result.canceled).toBe(false);
	});

	test("payload expired is canceled with endedAt=now", () => {
		const result = resolveFlashStatus({ plan: plan("expired"), now: NOW });
		expect(result.status).toBe(CusProductStatus.Expired);
		expect(result.canceled).toBe(true);
		expect(result.endedAt).toBe(NOW);
	});

	test("payload canceled with a future hydrated end stays Active until that end", () => {
		const result = resolveFlashStatus({
			plan: plan("canceled"),
			now: NOW,
			hydration: { endedAt: FUTURE },
		});
		expect(result.status).toBe(CusProductStatus.Active);
		expect(result.canceled).toBe(true);
		expect(result.endedAt).toBe(FUTURE);
	});

	test("payload canceled with no future end fails closed to Expired", () => {
		const result = resolveFlashStatus({ plan: plan("canceled"), now: NOW });
		expect(result.status).toBe(CusProductStatus.Expired);
		expect(result.canceled).toBe(true);
		expect(result.endedAt).toBe(NOW);
	});

	test("omitted plan.status falls back to the hydrated status", () => {
		const result = resolveFlashStatus({
			plan: plan(undefined),
			now: NOW,
			hydration: { status: CusProductStatus.Expired, endedAt: PAST },
		});
		expect(result.status).toBe(CusProductStatus.Expired);
	});
});
