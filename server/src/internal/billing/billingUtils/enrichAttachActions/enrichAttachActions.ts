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
import { applyExistingUsages } from "../handleExistingUsages/applyExistingUsages";
import { cusProductToExistingUsages } from "../handleExistingUsages/cusProductToExistingUsages";
import { initFullCusProduct } from "../initFullCusProduct/initFullCusProduct";

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
	const ongoingCusProduct = ongoingCusProductAction?.cusProduct!;

	// Get latest cycle end for each product
	const largestInterval = getLargestInterval({
		prices: product.prices,
		excludeOneOff: true,
	});

	// Initialize new cus product
	const newCusProduct = await initFullCusProduct({
		ctx,
		fullCus,
		insertContext: {
			fullCus,
			product,
			featureQuantities: [],
			replaceables: [],
		},
	});

	// Get existing usages
	const existingUsages = cusProductToExistingUsages({
		cusProduct: ongoingCusProduct,
		entityId: fullCus.entity?.id,
	});

	applyExistingUsages({
		features: ctx.features,
		cusProduct: newCusProduct,
		existingUsages,
		entities: fullCus.entities,
	});

	return actions;

	// 1. Get the starts at if new product is scheduled
	// 2. Get reset cycle anchor
	// 3. Get usage to apply to new product
	// 4. Get trial ends at (either from current subscription that we're merging with, or from new product)*
	// 5. Calculate line items for new product / upgrade* [let's do this]
	// 6. Get existing usages

	// 1. Calculate line items for usages
	// const newCusProduct = newProductAction?.product;

	console.log(`ongoing cus product:, ${ongoingCusProduct?.product.name}`);
	console.log(`new cus product:, ${newCusProduct.product.name}`);
	console.log(`billing cycle anchor: ${formatMs(billingCycleAnchor)}`);
	console.log(`test clock frozen time: ${formatMs(testClockFrozenTime)}`);

	// Get line items for ongoing cus product
	const ongoingLineItems = cusProductToLineItems({
		cusProduct: ongoingCusProduct!,
		testClockFrozenTime,
		billingCycleAnchor: billingCycleAnchor!,
		direction: "refund",
	});

	const arrearLineItems = cusProductToArrearLineItems({
		cusProduct: ongoingCusProduct!,
		billingCycleAnchor: billingCycleAnchor!,
		testClockFrozenTime,
	});

	const newLineItems = cusProductToLineItems({
		cusProduct: newCusProduct,
		testClockFrozenTime,
		billingCycleAnchor: billingCycleAnchor!,
		direction: "charge",
	});

	// From billing cycle anchor, now, and interval, calculate latest cycle start:
	// if (largestInterval && billingCycleAnchor) {
	// 	const cycleStart = getCycleStart({
	// 		anchor: billingCycleAnchor,
	// 		interval: largestInterval.interval,
	// 		intervalCount: largestInterval.intervalCount,
	// 		testClockFrozenTime,
	// 	});

	// 	console.log(`Now: ${formatMs(testClockFrozenTime)}`);
	// 	console.log(`Billing cycle anchor: ${formatMs(billingCycleAnchor)}`);
	// 	console.log(`Cycle start: ${formatMs(cycleStart)}`);
	// }

	return actions;
};
