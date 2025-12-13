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

	console.log("Largest interval:", largestInterval);

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
