import { describe, expect, test } from "bun:test";
import { CusProductStatus } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { buildBillingChangeResponse } from "@/internal/billing/v2/utils/billingChangeResponse";
import {
	expectBillingChangeResponse,
	findPlanChange,
} from "./helpers/expectBillingChange";
import { logChangeResponse } from "./helpers/logChangeResponse";
import {
	makeAutumnBillingPlan,
	makeUpdate,
} from "./helpers/makeAutumnBillingPlan";
import { makeFullCusProduct } from "./helpers/makeFullCusProduct";
import { makeFullCustomer } from "./helpers/makeFullCustomer";

const NOW = 1_710_000_000_000;
const PHASE_TWO = NOW + 30 * 24 * 60 * 60 * 1000;
const PHASE_THREE = NOW + 60 * 24 * 60 * 60 * 1000;
const ctx = {} as AutumnContext;

describe("buildBillingChangeResponse — createSchedule", () => {
	test("multi-phase schedule replacing current product", () => {
		const free = makeFullCusProduct({ planId: "free", startedAt: NOW - 1000 });
		const pro = makeFullCusProduct({
			planId: "pro",
			status: CusProductStatus.Active,
			startedAt: NOW,
		});
		const premiumPhase = makeFullCusProduct({
			planId: "premium",
			status: CusProductStatus.Scheduled,
			startedAt: PHASE_TWO,
		});
		const enterprisePhase = makeFullCusProduct({
			planId: "enterprise",
			status: CusProductStatus.Scheduled,
			startedAt: PHASE_THREE,
		});

		const response = buildBillingChangeResponse({
			ctx,
			originalFullCustomer: makeFullCustomer({ customerProducts: [free] }),
			autumnBillingPlan: makeAutumnBillingPlan({
				inserts: [pro, premiumPhase, enterprisePhase],
				update: makeUpdate({
					customerProduct: free,
					updates: {
						status: CusProductStatus.Expired,
						ended_at: NOW,
						canceled: true,
						canceled_at: NOW,
					},
				}),
			}),
		});
		logChangeResponse("createSchedule / multi-phase replacing current", response);

		expectBillingChangeResponse(response, {
			expired: ["free"],
			activated: ["pro"],
			scheduled: ["premium", "enterprise"],
		});
		expect(
			findPlanChange(response, { action: "activated", planId: "pro" })?.subscription
				?.status,
		).toBe("active");
		expect(
			findPlanChange(response, { action: "scheduled", planId: "premium" })?.subscription
				?.status,
		).toBe("scheduled");
		expect(
			findPlanChange(response, { action: "scheduled", planId: "enterprise" })
				?.subscription?.status,
		).toBe("scheduled");
	});

	test("schedule overrides existing scheduled products", () => {
		const pro = makeFullCusProduct({ planId: "pro", startedAt: NOW - 1000 });
		const oldScheduled = makeFullCusProduct({
			planId: "free",
			status: CusProductStatus.Scheduled,
			startedAt: PHASE_TWO,
		});
		const newScheduledPremium = makeFullCusProduct({
			planId: "premium",
			status: CusProductStatus.Scheduled,
			startedAt: PHASE_TWO,
		});
		const newScheduledEnterprise = makeFullCusProduct({
			planId: "enterprise",
			status: CusProductStatus.Scheduled,
			startedAt: PHASE_THREE,
		});

		const response = buildBillingChangeResponse({
			ctx,
			originalFullCustomer: makeFullCustomer({
				customerProducts: [pro, oldScheduled],
			}),
			autumnBillingPlan: makeAutumnBillingPlan({
				inserts: [newScheduledPremium, newScheduledEnterprise],
				deletes: [oldScheduled],
			}),
		});
		logChangeResponse(
			"createSchedule / schedule overrides existing scheduled",
			response,
		);

		// The old scheduled product is deleted, not expired — deletes are
		// intentionally skipped in v1.
		expectBillingChangeResponse(response, {
			scheduled: ["premium", "enterprise"],
		});
	});
});
