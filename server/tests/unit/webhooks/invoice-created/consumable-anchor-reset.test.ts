import { beforeEach, describe, expect, test } from "bun:test";
import {
	AppEnv,
	addCusProductToCusEnt,
	type FullCusEntWithFullCusProduct,
} from "@autumn/shared";
import { customerEntitlements } from "@tests/utils/fixtures/db/customerEntitlements";
import { customerProducts } from "@tests/utils/fixtures/db/customerProducts";
import { prices } from "@tests/utils/fixtures/db/prices";
import type { InvoiceCreatedContext } from "@/external/stripe/webhookHandlers/handleStripeInvoiceCreated/setupInvoiceCreatedContext";
import { createAutumnBillingPlanBuilder } from "@/internal/billing/v2/utils/billingPlanBuilder/createAutumnBillingPlanBuilder";
import { mockModuleWithRestore } from "../../utils/mockModuleWithRestore.js";

type CusEntFilter = (cusEnt: FullCusEntWithFullCusProduct) => boolean;
type ArrearLineItemArgs = {
	cusEntFilter: CusEntFilter;
	invoiceCredits: { cusEntFilter: CusEntFilter };
};

const ANCHOR_SECONDS = 1_790_000_000;
const arrearLineItemCalls: ArrearLineItemArgs[] = [];

await mockModuleWithRestore("@/external/stripe/webhookHandlers/common", () => ({
	eventContextToArrearLineItems: async (args: ArrearLineItemArgs) => {
		arrearLineItemCalls.push(args);
		return {
			lineItems: [],
			invoiceCreditLineItems: [],
			updateCustomerEntitlements: [],
		};
	},
}));

const { processConsumablePricesForInvoiceCreated } = await import(
	// @ts-expect-error Bun cache-busting query isolates module mocks.
	"@/external/stripe/webhookHandlers/handleStripeInvoiceCreated/tasks/processConsumablePricesForInvoiceCreated.js?anchorReset"
);

/** A consumable messages row whose period ends on the anchor, on its own customer product. */
const createConsumableCustomerEntitlement = ({
	customerProductId,
}: {
	customerProductId: string;
}) => {
	const price = prices.createConsumable({
		id: `price_${customerProductId}`,
		featureId: "messages",
	});
	const customerEntitlement = customerEntitlements.create({
		featureId: "messages",
		featureName: "Messages",
		allowance: 0,
		balance: -100,
		customerProductId,
		nextResetAt: ANCHOR_SECONDS * 1000,
	});
	const customerProduct = customerProducts.create({
		id: customerProductId,
		customerEntitlements: [customerEntitlement],
		customerPrices: [
			prices.createCustomer({ price, customerProductId: customerProductId }),
		],
	});
	return addCusProductToCusEnt({
		cusEnt: customerEntitlement,
		cusProduct: customerProduct,
	});
};

const anchored = createConsumableCustomerEntitlement({
	customerProductId: "cus_prod_anchored",
});
const untouched = createConsumableCustomerEntitlement({
	customerProductId: "cus_prod_untouched",
});

const makeEventContext = ({
	billingReason,
	anchorResetCustomerProductIds,
}: {
	billingReason: "subscription_cycle" | "subscription_update";
	anchorResetCustomerProductIds: string[];
}) =>
	({
		stripeInvoice: {
			id: "in_anchor",
			status: "draft",
			billing_reason: billingReason,
			period_end: ANCHOR_SECONDS,
		},
		stripeSubscription: {
			billing_cycle_anchor: ANCHOR_SECONDS,
			items: { data: [] },
		},
		customerProducts: [anchored.customer_product, untouched.customer_product],
		billingCycleAnchorResetCustomerProductIds: anchorResetCustomerProductIds,
		fullCustomer: { id: "customer_test", internal_id: "customer_internal" },
	}) as unknown as InvoiceCreatedContext;

const ctx = {
	org: { id: "org_test", config: { disable_overage_billing: false } },
	env: AppEnv.Sandbox,
	logger: { info: () => undefined, warn: () => undefined },
} as never;

const process = (eventContext: InvoiceCreatedContext) =>
	processConsumablePricesForInvoiceCreated({
		ctx,
		eventContext,
		plan: createAutumnBillingPlanBuilder({ customerId: "customer_test" }),
	});

describe("invoice.created consumables on a billing cycle anchor reset", () => {
	beforeEach(() => {
		arrearLineItemCalls.length = 0;
	});

	test("bills the usage of re-anchored products only", async () => {
		await process(
			makeEventContext({
				billingReason: "subscription_update",
				anchorResetCustomerProductIds: [anchored.customer_product!.id],
			}),
		);

		expect(arrearLineItemCalls).toHaveLength(1);
		const [{ cusEntFilter, invoiceCredits }] = arrearLineItemCalls as [
			ArrearLineItemArgs,
		];
		expect(cusEntFilter(anchored)).toBe(true);
		expect(cusEntFilter(untouched)).toBe(false);
		expect(invoiceCredits.cusEntFilter(anchored)).toBe(true);
		expect(invoiceCredits.cusEntFilter(untouched)).toBe(false);
	});

	test("a subscription_update without a landed anchor move bills no usage", async () => {
		const lineItems = await process(
			makeEventContext({
				billingReason: "subscription_update",
				anchorResetCustomerProductIds: [],
			}),
		);

		expect(lineItems).toEqual([]);
		expect(arrearLineItemCalls).toHaveLength(0);
	});

	test("a cycle invoice still bills every due product", async () => {
		await process(
			makeEventContext({
				billingReason: "subscription_cycle",
				anchorResetCustomerProductIds: [],
			}),
		);

		expect(arrearLineItemCalls).toHaveLength(1);
		const [{ cusEntFilter }] = arrearLineItemCalls as [ArrearLineItemArgs];
		expect(cusEntFilter(anchored)).toBe(true);
		expect(cusEntFilter(untouched)).toBe(true);
	});
});
