import {
	type AttachContext,
	type CusProductActions,
	cusProductToArrearLineItems,
	cusProductToLineItems,
	type FullCustomer,
	formatMs,
	getLargestInterval,
	secondsToMs,
} from "@autumn/shared";
import { createStripeCli } from "../../../../external/connect/createStripeCli";
import type { AutumnContext } from "../../../../honoUtils/HonoEnv";
import { applyCusProductActions } from "../applyCusProductActions/applyCusProductActions";
import { cusProductToExistingUsages } from "../handleExistingUsages/cusProductToExistingUsages";
import { initFullCusProduct } from "../initFullCusProduct/initFullCusProduct";
import { applyStripeDiscountsToLineItems } from "../stripeAdapter/applyStripeDiscounts/applyStripeDiscountsToLineItems";
import { subToDiscounts } from "../stripeAdapter/applyStripeDiscounts/subToDiscounts";
import { buildSubItemUpdate } from "../stripeAdapter/buildSubItems/buildSubItemUpdate";
import { createAndPayInvoice } from "../stripeAdapter/stripeInvoicing/createAndPayInvoice";

export const enrichAttachActions = async ({
	ctx,
	fullCus,
	actions,
	attachContext,
}: {
	ctx: AutumnContext;
	fullCus: FullCustomer;
	actions: CusProductActions;
	attachContext: AttachContext;
}) => {
	const { org, env } = ctx;
	const { newProductActions, ongoingCusProductAction } = actions;
	const stripeCli = createStripeCli({ org, env });

	const { sub, testClockFrozenTime } = attachContext;
	const billingCycleAnchor = secondsToMs(sub?.billing_cycle_anchor);
	const product = attachContext.products[0];
	const ongoingCusProduct = ongoingCusProductAction?.cusProduct;

	// Get latest cycle end for each product
	const largestInterval = getLargestInterval({
		prices: product.prices,
		excludeOneOff: true,
	});

	// Get existing usages
	const existingUsages = cusProductToExistingUsages({
		cusProduct: ongoingCusProduct,
		entityId: fullCus.entity?.id,
	});

	// Initialize new cus product
	const newCusProduct = await initFullCusProduct({
		ctx,
		fullCus,
		initContext: {
			fullCus,
			product,
			featureQuantities: [],
			replaceables: [],
			existingUsages,
		},
	});

	console.log(`ongoing cus product:, ${ongoingCusProduct?.product.name}`);
	console.log(`new cus product:, ${newCusProduct.product.name}`);
	console.log(`billing cycle anchor: ${formatMs(billingCycleAnchor)}`);
	console.log(`test clock frozen time: ${formatMs(testClockFrozenTime)}`);

	const arrearLineItems = cusProductToArrearLineItems({
		cusProduct: ongoingCusProduct!,
		billingCycleAnchor: billingCycleAnchor!,
		testClockFrozenTime,
		org,
	});

	// Get line items for ongoing cus product
	const ongoingLineItems = cusProductToLineItems({
		cusProduct: ongoingCusProduct!,
		testClockFrozenTime,
		billingCycleAnchor: billingCycleAnchor!,
		direction: "refund",
		org,
	});

	const newLineItems = cusProductToLineItems({
		cusProduct: newCusProduct,
		testClockFrozenTime,
		billingCycleAnchor: billingCycleAnchor!,
		direction: "charge",
		org,
	});

	// All items
	const allLineItems = [
		...ongoingLineItems,
		...arrearLineItems,
		...newLineItems,
	];

	// 1. Get discounts from sub, 2. GET NEW DISCOUNT
	const subDiscounts = subToDiscounts({ sub });

	const lineItemsAfterDiscounts = applyStripeDiscountsToLineItems({
		lineItems: allLineItems,
		discounts: subDiscounts,
	});

	await createAndPayInvoice({
		stripeCli,
		stripeCusId: fullCus.processor?.id || "",
		lineItems: lineItemsAfterDiscounts,
		paymentMethod: attachContext.paymentMethod,
		onPaymentFailure: "throw",
	});

	// Build sub item update
	const subItemUpdate = buildSubItemUpdate({
		ctx,
		attachContext,
		ongoingCusProduct,
		newCusProducts: [newCusProduct],
	});

	await stripeCli.subscriptions.update(sub?.id || "", {
		items: subItemUpdate,
		proration_behavior: "none",
	});

	await applyCusProductActions({
		ctx,
		cusProductActions: actions,
		newCusProducts: [newCusProduct],
	});

	return actions;

	// 1. Get the starts at if new product is scheduled
	// 2. Get reset cycle anchor
	// 3. Get usage to apply to new product
	// 4. Get trial ends at (either from current subscription that we're merging with, or from new product)*
	// 5. Calculate line items for new product / upgrade* [let's do this]
	// 6. Get existing usages

	// 1. Calculate line items for usages
};
