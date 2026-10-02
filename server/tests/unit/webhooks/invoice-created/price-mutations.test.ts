import { beforeEach, expect, test } from "bun:test";
import { EntInterval } from "@autumn/shared";
import { contexts } from "@tests/utils/fixtures/db/contexts";
import { customerEntitlements } from "@tests/utils/fixtures/db/customerEntitlements";
import { customerProducts } from "@tests/utils/fixtures/db/customerProducts";
import { prices } from "@tests/utils/fixtures/db/prices";
import type { InvoiceCreatedContext } from "@/external/stripe/webhookHandlers/handleStripeInvoiceCreated/setupInvoiceCreatedContext";
import { processAllocatedPricesForInvoiceCreated } from "@/external/stripe/webhookHandlers/handleStripeInvoiceCreated/tasks/processAllocatedPricesForInvoiceCreated";
import { processPrepaidPricesForInvoiceCreated } from "@/external/stripe/webhookHandlers/handleStripeInvoiceCreated/tasks/processPrepaidPricesForInvoiceCreated";
import type { StripeWebhookContext } from "@/external/stripe/webhookMiddlewares/stripeWebhookContext";
import {
	type AutumnBillingPlanBuilder,
	createAutumnBillingPlanBuilder,
} from "@/internal/billing/v2/utils/billingPlanBuilder/createAutumnBillingPlanBuilder";

let plan: AutumnBillingPlanBuilder;

beforeEach(() => {
	plan = createAutumnBillingPlanBuilder({ customerId: "customer_123" });
});

const createScenario = ({
	allocated = false,
	separateResetInterval = false,
	upcomingQuantity,
}: {
	allocated?: boolean;
	separateResetInterval?: boolean;
	upcomingQuantity?: number;
} = {}) => {
	const customerEntitlement = customerEntitlements.create({
		featureId: "users",
		featureName: "Users",
		allowance: 3,
		balance: 1,
		interval: separateResetInterval ? EntInterval.Day : EntInterval.Month,
	});
	const priceParams = { id: "price_123", featureId: "users" };
	const price = allocated
		? prices.createAllocated(priceParams)
		: prices.createPrepaid(priceParams);
	const customerProduct = customerProducts.create({
		customerEntitlements: [customerEntitlement],
		customerPrices: [prices.createCustomer({ price })],
		options: [
			{
				feature_id: "users",
				internal_feature_id: "internal_users",
				quantity: 2,
				upcoming_quantity: upcomingQuantity,
			},
		],
	});
	const ctx = { ...contexts.create({}), extraLogs: {} } as StripeWebhookContext;
	const eventContext = {
		stripeInvoice: { billing_reason: "subscription_cycle" },
		stripeSubscription: {
			metadata: {},
			items: {
				data: [{ current_period_start: 1000, current_period_end: 2000 }],
			},
		},
		customerProducts: [customerProduct],
		billingCycleAnchorResetCustomerProductIds: [],
		nowMs: 1000000,
		results: { customerStateChanged: false },
	} as unknown as InvoiceCreatedContext;
	return { ctx, eventContext, customerEntitlement };
};

test("prepaid renewal plans a balance reset", () => {
	const { ctx, eventContext, customerEntitlement } = createScenario();
	processPrepaidPricesForInvoiceCreated({ ctx, eventContext, plan });
	const { updateCustomerEntitlements, updateCustomerProducts } = plan.build();
	expect(updateCustomerEntitlements).toHaveLength(1);
	expect(updateCustomerEntitlements?.[0]).toMatchObject({
		customerEntitlement: { id: customerEntitlement.id },
		updates: { balance: 3 + 2, next_reset_at: 2000 * 1000 },
	});
	expect(updateCustomerProducts).toHaveLength(0);
	expect(plan.hasChanges()).toBe(true);
});

test.each([undefined, 4])(
	"separate reset intervals plan only an applied quantity change: %s",
	(upcomingQuantity) => {
		const { ctx, eventContext } = createScenario({
			separateResetInterval: true,
			upcomingQuantity,
		});
		processPrepaidPricesForInvoiceCreated({ ctx, eventContext, plan });
		const { updateCustomerEntitlements, updateCustomerProducts } = plan.build();
		expect(updateCustomerEntitlements).toHaveLength(0);
		expect(updateCustomerProducts).toHaveLength(
			upcomingQuantity === undefined ? 0 : 1,
		);
		if (upcomingQuantity !== undefined)
			expect(updateCustomerProducts?.[0]?.updates.options?.[0]).toMatchObject({
				quantity: upcomingQuantity,
				upcoming_quantity: undefined,
			});
		expect(plan.hasChanges()).toBe(upcomingQuantity !== undefined);
	},
);

test.each([false, true])(
	"allocated renewal plans the freed seats' return: %s",
	(removeReplaceable) => {
		const { ctx, eventContext, customerEntitlement } = createScenario({
			allocated: true,
		});
		if (removeReplaceable) {
			customerEntitlement.replaceables = [
				{
					id: "replaceable_123",
					delete_next_cycle: true,
				} as (typeof customerEntitlement.replaceables)[number],
			];
		}
		processAllocatedPricesForInvoiceCreated({ ctx, eventContext, plan });
		const { updateCustomerEntitlements } = plan.build();
		expect(updateCustomerEntitlements).toHaveLength(removeReplaceable ? 1 : 0);
		if (removeReplaceable)
			expect(updateCustomerEntitlements?.[0]).toMatchObject({
				customerEntitlement: { id: customerEntitlement.id },
				balanceChange: 1,
				deletedReplaceables: [{ id: "replaceable_123" }],
			});
		expect(plan.hasChanges()).toBe(removeReplaceable);
	},
);
