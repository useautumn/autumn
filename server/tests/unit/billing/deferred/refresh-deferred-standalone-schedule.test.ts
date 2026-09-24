/**
 * A standalone (future-start) schedule is linked through customer products, not the subscription.
 * If it still exists when the invoice is paid, the snapshot must replay rather than create another.
 *
 * Red (before):  the live lookup only follows subscription.schedule, so the schedule looks replaced
 * Green (after): the snapshot's own schedule id is looked up too, and the plan replays unchanged
 */

import { expect, test } from "bun:test";
import {
	AppEnv,
	type DeferredAutumnBillingPlanData,
	StripeBillingStage,
} from "@autumn/shared";
import { mockModuleWithRestore } from "../../utils/mockModuleWithRestore.js";
import { makeFullCustomer } from "../billing-change-response/helpers/makeFullCustomer.js";

const STANDALONE_SCHEDULE_ID = "sub_sched_standalone";

const state = { rebuilds: 0 };

await mockModuleWithRestore("@/external/connect/createStripeCli.js", () => ({
	createStripeCli: () => ({
		subscriptions: {
			retrieve: async () => ({
				id: "sub_1",
				schedule: null,
				items: { data: [] },
			}),
		},
		subscriptionSchedules: {
			retrieve: async (id: string) => ({ id, status: "not_started" }),
		},
	}),
}));

await mockModuleWithRestore("@/internal/customers/CusService.js", () => ({
	CusService: { getFull: async () => makeFullCustomer() },
}));

await mockModuleWithRestore(
	"@/internal/billing/v2/providers/stripe/actionBuilders/evaluateStripeBillingPlan.js",
	() => ({
		evaluateStripeBillingPlan: async () => {
			state.rebuilds += 1;
			return {};
		},
	}),
);

const { refreshDeferredBillingPlan } = await import(
	"@/internal/billing/v2/execute/refreshDeferredBillingPlan/refreshDeferredBillingPlan.js"
);

test("a standalone schedule that still exists keeps the snapshot", async () => {
	const deferredData = {
		requestId: "req_1",
		orgId: "org_1",
		env: AppEnv.Sandbox,
		resumeAfter: StripeBillingStage.InvoiceAction,
		billingContext: {
			fullCustomer: makeFullCustomer(),
			stripeSubscription: { id: "sub_1" },
			stripeSubscriptionSchedule: { id: STANDALONE_SCHEDULE_ID },
		},
		billingPlan: {
			autumn: { insertCustomerProducts: [] },
			stripe: {
				subscriptionScheduleAction: {
					type: "update",
					stripeSubscriptionScheduleId: STANDALONE_SCHEDULE_ID,
					params: {},
				},
			},
		},
	} as unknown as DeferredAutumnBillingPlanData;

	const result = await refreshDeferredBillingPlan({
		ctx: { org: { id: "org_1" }, env: AppEnv.Sandbox } as never,
		deferredData,
	});

	expect(state.rebuilds).toBe(0);
	expect(result.billingPlan).toBe(deferredData.billingPlan);
});
