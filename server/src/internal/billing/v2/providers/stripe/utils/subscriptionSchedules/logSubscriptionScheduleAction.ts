import { formatSecondsToDate } from "@autumn/shared";
import type { AutumnContext } from "@server/honoUtils/HonoEnv";
import type { BillingContext } from "@server/internal/billing/v2/billingContext";
import type { StripeSubscriptionScheduleAction } from "@server/internal/billing/v2/types/billingPlan";
import type Stripe from "stripe";
import { billingContextFormatPriceByStripePriceId } from "@/internal/billing/v2/utils/billingContextPriceLookup";

/**
 * Formats a phase item for logging.
 */
const formatPhaseItem = ({
	item,
	billingContext,
}: {
	item: Stripe.SubscriptionScheduleUpdateParams.Phase.Item;
	billingContext: BillingContext;
}): string => {
	const stripePriceId =
		typeof item.price === "string"
			? item.price
			: (item.price as unknown as Stripe.Price)?.id;

	const priceDisplay = stripePriceId
		? billingContextFormatPriceByStripePriceId({
				stripePriceId,
				billingContext,
			})
		: "unknown";

	const quantityDisplay =
		item.quantity === undefined ? "undefined" : item.quantity;

	return `    - price: ${priceDisplay}, quantity: ${quantityDisplay}`;
};

/**
 * Logs subscription schedule action details for debugging.
 */
export const logSubscriptionScheduleAction = ({
	ctx,
	billingContext,
	subscriptionScheduleAction,
}: {
	ctx: AutumnContext;
	billingContext: BillingContext;
	subscriptionScheduleAction: StripeSubscriptionScheduleAction;
}): void => {
	const phases = subscriptionScheduleAction.params.phases ?? [];

	ctx.logger.debug(
		`[logSubscriptionScheduleAction] Action type: ${subscriptionScheduleAction.type}`,
	);

	ctx.logger.debug(
		`[logSubscriptionScheduleAction] Phases (${phases.length}):`,
	);

	for (let index = 0; index < phases.length; index++) {
		const phase = phases[index];
		const startDate = formatSecondsToDate(
			phase.start_date as number | undefined,
		);
		const endDate = formatSecondsToDate(phase.end_date as number | undefined);
		const trialEndDate = formatSecondsToDate(
			phase.trial_end as number | undefined,
		);

		ctx.logger.debug(`  Phase ${index + 1}:`);
		ctx.logger.debug(`    Start: ${startDate}`);
		ctx.logger.debug(`    End: ${endDate}`);
		ctx.logger.debug(`    Trial End: ${trialEndDate}`);
		ctx.logger.debug(`    Items:`);

		for (const item of phase.items ?? []) {
			const formattedItem = formatPhaseItem({ item, billingContext });
			ctx.logger.debug(formattedItem);
		}
	}
};
