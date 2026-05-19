import { describe, expect, test } from "bun:test";
import { CusProductStatus } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { buildBillingChangeResponse } from "@/internal/billing/v2/utils/billingChangeResponse";
import {
	expectBillingChangeResponse,
	expectPlanChange,
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
const PERIOD_END = NOW + 30 * 24 * 60 * 60 * 1000;
const ctx = {} as AutumnContext;

describe("buildBillingChangeResponse — attach", () => {
	test("new customer, free plan attach", () => {
		const free = makeFullCusProduct({ planId: "free", startedAt: NOW });

		const response = buildBillingChangeResponse({
			ctx,
			originalFullCustomer: makeFullCustomer(),
			autumnBillingPlan: makeAutumnBillingPlan({ inserts: [free] }),
		});
		logChangeResponse("attach / new customer, free plan", response);

		expectBillingChangeResponse(response, {
			customerId: "cus_test",
			activated: ["free"],
		});
		expectPlanChange(findPlanChange(response, { action: "activated", planId: "free" }), {
			action: "activated",
			planId: "free",
			previousAttributes: null,
			itemChanges: [],
		});
	});

	test("new customer, paid plan attach", () => {
		const pro = makeFullCusProduct({ planId: "pro", startedAt: NOW });

		const response = buildBillingChangeResponse({
			ctx,
			originalFullCustomer: makeFullCustomer(),
			autumnBillingPlan: makeAutumnBillingPlan({ inserts: [pro] }),
		});
		logChangeResponse("attach / new customer, paid plan", response);

		expectBillingChangeResponse(response, { activated: ["pro"] });
		expectPlanChange(findPlanChange(response, { action: "activated", planId: "pro" }), {
			action: "activated",
			planId: "pro",
			previousAttributes: null,
		});
	});

	test("immediate upgrade (free → pro)", () => {
		const free = makeFullCusProduct({ planId: "free", startedAt: NOW - 1000 });
		const pro = makeFullCusProduct({ planId: "pro", startedAt: NOW });

		const response = buildBillingChangeResponse({
			ctx,
			originalFullCustomer: makeFullCustomer({ customerProducts: [free] }),
			autumnBillingPlan: makeAutumnBillingPlan({
				inserts: [pro],
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
		logChangeResponse("attach / immediate upgrade (free → pro)", response);

		expectBillingChangeResponse(response, {
			expired: ["free"],
			activated: ["pro"],
		});
		expectPlanChange(findPlanChange(response, { action: "expired", planId: "free" }), {
			action: "expired",
			planId: "free",
			previousAttributes: {
				status: CusProductStatus.Active,
				canceled_at: null,
				expires_at: null,
			},
		});
		expectPlanChange(findPlanChange(response, { action: "activated", planId: "pro" }), {
			action: "activated",
			planId: "pro",
			previousAttributes: null,
		});
	});

	test("upgrade that also clears an existing scheduled downgrade", () => {
		const business = makeFullCusProduct({
			planId: "business",
			startedAt: NOW - 1000,
		});
		const scheduledPro = makeFullCusProduct({
			planId: "pro",
			status: CusProductStatus.Scheduled,
			startedAt: PERIOD_END,
			id: "cp_pro_scheduled",
		});
		const premium = makeFullCusProduct({ planId: "premium", startedAt: NOW });

		const response = buildBillingChangeResponse({
			ctx,
			originalFullCustomer: makeFullCustomer({
				customerProducts: [business, scheduledPro],
			}),
			autumnBillingPlan: makeAutumnBillingPlan({
				inserts: [premium],
				update: makeUpdate({
					customerProduct: business,
					updates: {
						status: CusProductStatus.Expired,
						ended_at: NOW,
						canceled: true,
						canceled_at: NOW,
					},
				}),
				deleteOne: scheduledPro,
			}),
		});
		logChangeResponse(
			"attach / upgrade clears existing scheduled downgrade",
			response,
		);

		// Deleted (scheduled) products are intentionally ignored — they never
		// went live and aren't a customer-facing lifecycle event.
		expectBillingChangeResponse(response, {
			expired: ["business"],
			activated: ["premium"],
		});
		expect(
			findPlanChange(response, { action: "expired", planId: "pro" }),
		).toBeUndefined();
	});

	test("scheduled downgrade via starts_at", () => {
		const pro = makeFullCusProduct({ planId: "pro", startedAt: NOW - 1000 });
		const scheduledFree = makeFullCusProduct({
			planId: "free",
			status: CusProductStatus.Scheduled,
			startedAt: PERIOD_END,
		});

		const response = buildBillingChangeResponse({
			ctx,
			originalFullCustomer: makeFullCustomer({ customerProducts: [pro] }),
			autumnBillingPlan: makeAutumnBillingPlan({
				inserts: [scheduledFree],
				update: makeUpdate({
					customerProduct: pro,
					updates: {
						canceled: true,
						canceled_at: NOW,
						ended_at: PERIOD_END,
					},
				}),
			}),
		});
		logChangeResponse("attach / scheduled downgrade (starts_at)", response);

		expectBillingChangeResponse(response, {
			updated: ["pro"],
			scheduled: ["free"],
		});
		expectPlanChange(findPlanChange(response, { action: "updated", planId: "pro" }), {
			action: "updated",
			planId: "pro",
			previousAttributes: { canceled_at: null, expires_at: null },
		});
		const scheduled = findPlanChange(response, {
			action: "scheduled",
			planId: "free",
		});
		expect(scheduled?.plan.status).toBe("scheduled");
	});

	test("attach addon (no current product mutated)", () => {
		const base = makeFullCusProduct({ planId: "pro", startedAt: NOW - 1000 });
		const addon = makeFullCusProduct({ planId: "seats_addon", startedAt: NOW });

		const response = buildBillingChangeResponse({
			ctx,
			originalFullCustomer: makeFullCustomer({ customerProducts: [base] }),
			autumnBillingPlan: makeAutumnBillingPlan({ inserts: [addon] }),
		});
		logChangeResponse("attach / addon", response);

		expectBillingChangeResponse(response, { activated: ["seats_addon"] });
	});

	test("trial revert: pause current and attach trial", () => {
		const base = makeFullCusProduct({
			planId: "pro",
			status: CusProductStatus.Active,
			startedAt: NOW - 1000,
		});
		const trialProduct = makeFullCusProduct({
			planId: "premium",
			status: CusProductStatus.Trialing,
			startedAt: NOW,
		});

		const response = buildBillingChangeResponse({
			ctx,
			originalFullCustomer: makeFullCustomer({ customerProducts: [base] }),
			autumnBillingPlan: makeAutumnBillingPlan({
				inserts: [trialProduct],
				update: makeUpdate({
					customerProduct: base,
					updates: { status: CusProductStatus.Paused },
				}),
			}),
		});
		logChangeResponse("attach / trial revert (pause current)", response);

		expectBillingChangeResponse(response, {
			updated: ["pro"],
			activated: ["premium"],
		});
		const updated = findPlanChange(response, {
			action: "updated",
			planId: "pro",
		});
		expectPlanChange(updated, {
			action: "updated",
			planId: "pro",
			previousAttributes: { status: CusProductStatus.Active },
		});
		expect(updated?.plan.status).toBe("paused");
	});
});
