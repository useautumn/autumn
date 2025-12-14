import {
	type AttachContext,
	type CusProductActions,
	type FullCustomer,
	formatMs,
	getCycleStart,
	getLargestInterval,
	secondsToMs,
} from "@autumn/shared";
import { createStripeCli } from "../../../../external/connect/createStripeCli";
import type { AutumnContext } from "../../../../honoUtils/HonoEnv";

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
	const now = testClockFrozenTime ?? Date.now();
	const product = attachContext.products[0];

	console.log(
		`Sub: ${sub?.id}, Billing cycle anchor: ${formatMs(billingCycleAnchor)}, Now: ${formatMs(now)}`,
	);

	// Get latest cycle end for each product
	const largestInterval = getLargestInterval({
		prices: product.prices,
		excludeOneOff: true,
	});

	// 1. Get the starts at if new product is scheduled
	// 2. Get reset cycle anchor
	// 3. Get usage to apply to new product
	// 4. Get trial ends at (either from current subscription that we're merging with, or from new product)*
	// 5. Calculate line items for new product / upgrade* [let's do this]

	// From billing cycle anchor, now, and interval, calculate latest cycle start:
	if (largestInterval && billingCycleAnchor) {
		const cycleStart = getCycleStart({
			anchor: billingCycleAnchor,
			interval: largestInterval.interval,
			intervalCount: largestInterval.intervalCount,
			now,
		});

		console.log(`Now: ${formatMs(now)}`);
		console.log(`Billing cycle anchor: ${formatMs(billingCycleAnchor)}`);
		console.log(`Cycle start: ${formatMs(cycleStart)}`);
	}

	return actions;
};
