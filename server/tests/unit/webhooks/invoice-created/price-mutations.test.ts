import { beforeEach, expect, mock, test } from "bun:test";
import { EntInterval } from "@autumn/shared";
import { contexts } from "@tests/utils/fixtures/db/contexts";
import { customerEntitlements } from "@tests/utils/fixtures/db/customerEntitlements";
import { customerProducts } from "@tests/utils/fixtures/db/customerProducts";
import { prices } from "@tests/utils/fixtures/db/prices";
import type { InvoiceCreatedContext } from "@/external/stripe/webhookHandlers/handleStripeInvoiceCreated/setupInvoiceCreatedContext";
import type { StripeWebhookContext } from "@/external/stripe/webhookMiddlewares/stripeWebhookContext";
import { mockModuleWithRestore } from "../../utils/mockModuleWithRestore";

const updateProduct = mock(async () => {});
const updateEntitlement = mock(async () => {});
const incrementEntitlement = mock(async () => {});
const deleteReplaceables = mock(async () => {});

await mockModuleWithRestore(
	"@/internal/customers/cusProducts/CusProductService",
	() => ({
		CusProductService: { update: updateProduct },
	}),
);
await mockModuleWithRestore(
	"@/internal/customers/cusProducts/cusEnts/CusEntitlementService",
	() => ({
		CusEntService: {
			update: updateEntitlement,
			increment: incrementEntitlement,
		},
	}),
);
await mockModuleWithRestore(
	"@/internal/customers/cusProducts/cusEnts/RepService",
	() => ({
		RepService: { deleteInIds: deleteReplaceables },
	}),
);

const { processPrepaidPricesForInvoiceCreated } = await import(
	"@/external/stripe/webhookHandlers/handleStripeInvoiceCreated/tasks/processPrepaidPricesForInvoiceCreated"
);
const { processAllocatedPricesForInvoiceCreated } = await import(
	"@/external/stripe/webhookHandlers/handleStripeInvoiceCreated/tasks/processAllocatedPricesForInvoiceCreated"
);

beforeEach(() => {
	for (const write of [
		updateProduct,
		updateEntitlement,
		incrementEntitlement,
		deleteReplaceables,
	])
		write.mockClear();
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

test("prepaid renewal records a balance reset", async () => {
	const { ctx, eventContext } = createScenario();
	await processPrepaidPricesForInvoiceCreated({ ctx, eventContext });
	expect(updateEntitlement).toHaveBeenCalledTimes(1);
	expect(eventContext.results.customerStateChanged).toBe(true);
});

test.each([undefined, 4])(
	"separate reset intervals record only an applied quantity change: %s",
	async (upcomingQuantity) => {
		const { ctx, eventContext } = createScenario({
			separateResetInterval: true,
			upcomingQuantity,
		});
		await processPrepaidPricesForInvoiceCreated({ ctx, eventContext });
		expect(updateEntitlement).not.toHaveBeenCalled();
		expect(updateProduct).toHaveBeenCalledTimes(
			upcomingQuantity === undefined ? 0 : 1,
		);
		expect(eventContext.results.customerStateChanged).toBe(
			upcomingQuantity !== undefined,
		);
	},
);

test.each([false, true])(
	"allocated renewal records whether replaceables were removed: %s",
	async (removeReplaceable) => {
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
		await processAllocatedPricesForInvoiceCreated({ ctx, eventContext });
		expect(incrementEntitlement).toHaveBeenCalledTimes(
			removeReplaceable ? 1 : 0,
		);
		expect(deleteReplaceables).toHaveBeenCalledTimes(removeReplaceable ? 1 : 0);
		expect(eventContext.results.customerStateChanged).toBe(removeReplaceable);
	},
);
