import { describe, expect, test } from "bun:test";
import { CusProductStatus, type InsertCustomerProduct } from "@autumn/shared";
import { eventContextToAutumnBillingPlan } from "@/external/stripe/webhookHandlers/common/eventContextToAutumnBillingPlan";
import type { StripeSubscriptionUpdatedContext } from "@/external/stripe/webhookHandlers/handleStripeSubscriptionUpdated/stripeSubscriptionUpdatedContext";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { buildBillingChangeResponse } from "@/internal/billing/v2/utils/billingChangeResponse";
import {
	expectBillingChangeResponse,
	expectPlanChange,
	findPlanChange,
} from "./helpers/expectBillingChange";
import { logChangeResponse } from "./helpers/logChangeResponse";
import { makeFullCusProduct } from "./helpers/makeFullCusProduct";
import { makeFullCustomer } from "./helpers/makeFullCustomer";

const NOW = 1_710_000_000_000;
const PERIOD_END = NOW + 30 * 24 * 60 * 60 * 1000;
const ctx = {} as AutumnContext;

const makeUpdatedContext = ({
	inserted = [],
	updated = [],
	deleted = [],
}: {
	inserted?: StripeSubscriptionUpdatedContext["insertedCustomerProducts"];
	updated?: StripeSubscriptionUpdatedContext["updatedCustomerProducts"];
	deleted?: StripeSubscriptionUpdatedContext["deletedCustomerProducts"];
} = {}): StripeSubscriptionUpdatedContext => {
	return {
		fullCustomer: makeFullCustomer(),
		customerProducts: [],
		nowMs: NOW,
		stripeSubscription:
			{} as StripeSubscriptionUpdatedContext["stripeSubscription"],
		previousAttributes: {},
		insertedCustomerProducts: inserted,
		updatedCustomerProducts: updated,
		deletedCustomerProducts: deleted,
		oneOffPrepaidCarryOvers: [],
		billingChangeTags: new Set<string>(),
	};
};

const updateOf = (
	customerProduct: StripeSubscriptionUpdatedContext["updatedCustomerProducts"][number]["customerProduct"],
	updates: Partial<InsertCustomerProduct>,
): StripeSubscriptionUpdatedContext["updatedCustomerProducts"][number] => ({
	customerProduct,
	updates,
});

describe("eventContextToAutumnBillingPlan + buildBillingChangeResponse", () => {
	test("empty context produces an empty response", () => {
		const eventContext = makeUpdatedContext();

		const response = buildBillingChangeResponse({
			ctx,
			originalFullCustomer: eventContext.fullCustomer,
			autumnBillingPlan: eventContextToAutumnBillingPlan(eventContext),
		});
		logChangeResponse("event-context / empty", response);

		expectBillingChangeResponse(response, {});
		expect(response.plan_changes).toEqual([]);
	});

	test("inserted active product → activated change", () => {
		const newPro = makeFullCusProduct({
			planId: "pro",
			status: CusProductStatus.Active,
			startedAt: NOW,
		});
		const eventContext = makeUpdatedContext({ inserted: [newPro] });

		const response = buildBillingChangeResponse({
			ctx,
			originalFullCustomer: eventContext.fullCustomer,
			autumnBillingPlan: eventContextToAutumnBillingPlan(eventContext),
		});
		logChangeResponse("event-context / inserted active", response);

		expectBillingChangeResponse(response, { activated: ["pro"] });
		expectPlanChange(
			findPlanChange(response, { action: "activated", planId: "pro" }),
			{
				action: "activated",
				planId: "pro",
				previousAttributes: null,
			},
		);
	});

	test("inserted scheduled product → scheduled change", () => {
		const futureFree = makeFullCusProduct({
			planId: "free",
			status: CusProductStatus.Scheduled,
			startedAt: PERIOD_END,
		});
		const eventContext = makeUpdatedContext({ inserted: [futureFree] });

		const response = buildBillingChangeResponse({
			ctx,
			originalFullCustomer: eventContext.fullCustomer,
			autumnBillingPlan: eventContextToAutumnBillingPlan(eventContext),
		});
		logChangeResponse("event-context / inserted scheduled", response);

		expectBillingChangeResponse(response, { scheduled: ["free"] });
	});

	test("updated product (status → past_due) → updated change with previous_attributes", () => {
		const business = makeFullCusProduct({
			planId: "business",
			status: CusProductStatus.Active,
			startedAt: NOW - 1000,
		});
		const eventContext = makeUpdatedContext({
			updated: [updateOf(business, { status: CusProductStatus.PastDue })],
		});

		const response = buildBillingChangeResponse({
			ctx,
			originalFullCustomer: eventContext.fullCustomer,
			autumnBillingPlan: eventContextToAutumnBillingPlan(eventContext),
		});
		logChangeResponse("event-context / updated to past_due", response);

		expectBillingChangeResponse(response, { updated: ["business"] });
		// Active → PastDue: public `status` stays "active" both before and after
		// (past_due is not a public status value); the flip is conveyed via the
		// `past_due` flag in previous_attributes.
		expectPlanChange(
			findPlanChange(response, { action: "updated", planId: "business" }),
			{
				action: "updated",
				planId: "business",
				previousAttributes: { past_due: false },
			},
		);
	});

	test("updated product with status=Expired → expired change", () => {
		const pro = makeFullCusProduct({
			planId: "pro",
			startedAt: NOW - 1000,
		});
		const eventContext = makeUpdatedContext({
			updated: [
				updateOf(pro, {
					status: CusProductStatus.Expired,
					ended_at: NOW,
					canceled: true,
					canceled_at: NOW,
				}),
			],
		});

		const response = buildBillingChangeResponse({
			ctx,
			originalFullCustomer: eventContext.fullCustomer,
			autumnBillingPlan: eventContextToAutumnBillingPlan(eventContext),
		});
		logChangeResponse("event-context / updated to expired", response);

		expectBillingChangeResponse(response, { expired: ["pro"] });
		expectPlanChange(
			findPlanChange(response, { action: "expired", planId: "pro" }),
			{
				action: "expired",
				planId: "pro",
				previousAttributes: {
					status: CusProductStatus.Active,
					canceled_at: null,
					expires_at: null,
				},
			},
		);
	});

	test("deleted products are ignored", () => {
		const scheduledFree = makeFullCusProduct({
			planId: "free",
			status: CusProductStatus.Scheduled,
			startedAt: PERIOD_END,
		});
		const eventContext = makeUpdatedContext({ deleted: [scheduledFree] });

		const response = buildBillingChangeResponse({
			ctx,
			originalFullCustomer: eventContext.fullCustomer,
			autumnBillingPlan: eventContextToAutumnBillingPlan(eventContext),
		});
		logChangeResponse("event-context / deleted ignored", response);

		expectBillingChangeResponse(response, {});
		expect(response.plan_changes).toEqual([]);
	});

	test("end-to-end schedule phase change (old expires, new activates)", () => {
		const oldFree = makeFullCusProduct({
			planId: "free",
			startedAt: NOW - 30 * 24 * 60 * 60 * 1000,
		});
		const newPro = makeFullCusProduct({
			planId: "pro",
			status: CusProductStatus.Active,
			startedAt: NOW,
		});
		const eventContext = makeUpdatedContext({
			updated: [
				updateOf(oldFree, {
					status: CusProductStatus.Expired,
					ended_at: NOW,
					canceled: true,
					canceled_at: NOW,
				}),
			],
			inserted: [newPro],
		});

		const response = buildBillingChangeResponse({
			ctx,
			originalFullCustomer: eventContext.fullCustomer,
			autumnBillingPlan: eventContextToAutumnBillingPlan(eventContext),
		});
		logChangeResponse("event-context / schedule phase change", response);

		expectBillingChangeResponse(response, {
			expired: ["free"],
			activated: ["pro"],
		});
	});

	test("end-to-end cancel-at-period-end via webhook (canceled_at + ended_at set)", () => {
		const business = makeFullCusProduct({
			planId: "business",
			startedAt: NOW - 1000,
		});
		const eventContext = makeUpdatedContext({
			updated: [
				updateOf(business, {
					canceled: true,
					canceled_at: NOW,
					ended_at: PERIOD_END,
				}),
			],
		});

		const response = buildBillingChangeResponse({
			ctx,
			originalFullCustomer: eventContext.fullCustomer,
			autumnBillingPlan: eventContextToAutumnBillingPlan(eventContext),
		});
		logChangeResponse("event-context / cancel at period end", response);

		expectBillingChangeResponse(response, { updated: ["business"] });
		expectPlanChange(
			findPlanChange(response, { action: "updated", planId: "business" }),
			{
				action: "updated",
				planId: "business",
				previousAttributes: { canceled_at: null, expires_at: null },
			},
		);
	});
});
