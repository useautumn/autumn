import { type FullCusProduct, formatMs } from "@autumn/shared";
import type { DrizzleCli } from "@server/db/initDrizzle";
import { PriceService } from "@server/internal/products/prices/PriceService";
import { formatPrice } from "@server/internal/products/prices/priceUtils";
import { notNullish } from "@server/utils/genUtils";
import { differenceInDays, subDays } from "date-fns";
import type Stripe from "stripe";

export const cusProductInPhase = ({
	phaseStart,
	phaseStartMillis,
	cusProduct,
}: {
	phaseStart?: number;
	phaseStartMillis?: number;
	cusProduct: FullCusProduct;
}) => {
	const oneDayBeforeCusProductStartsAt = subDays(
		cusProduct.starts_at,
		1,
	).getTime();
	const finalPhaseStart = phaseStartMillis ?? phaseStart! * 1000;

	return finalPhaseStart >= oneDayBeforeCusProductStartsAt;
};

export const similarUnix = ({
	unix1,
	unix2,
}: {
	unix1: number;
	unix2: number;
}) => {
	return Math.abs(differenceInDays(unix1, unix2)) <= 1;
};

export const logPhaseItems = async ({
	items,
	db,
	withId = false,
}: {
	items: Stripe.SubscriptionScheduleUpdateParams.Phase.Item[];
	db: DrizzleCli;
	withId?: boolean;
}) => {
	const priceIds = items
		.map((item) => {
			if (typeof item.price === "string") return item.price;

			return (item.price as unknown as Stripe.Price)?.id;
		})
		.filter(notNullish);

	const autumnPrices = await PriceService.getByStripeIds({
		db,
		stripePriceIds: priceIds,
	});
	for (const item of items) {
		const priceId =
			typeof item.price === "string" ? item.price : (item.price as any)?.id;
		console.log({
			id: withId ? (item as any).id : undefined,
			price: priceId,
			quantity: item.quantity,
			autumnPrice: autumnPrices[priceId]
				? `${autumnPrices[priceId]?.product.name} - ${formatPrice({ price: autumnPrices[priceId] })}`
				: "N/A",
		});
	}
};

export const getCurrentPhaseIndex = ({
	schedule,
	now,
}: {
	schedule: Stripe.SubscriptionSchedule;
	now?: number;
}) => {
	return schedule.phases.findIndex(
		(phase) =>
			(now || Date.now()) / 1000 >= phase.start_date &&
			(now || Date.now()) / 1000 < phase.end_date,
	);
};

const ensureMilliseconds = (timestamp: number | undefined): number => {
	if (!timestamp) return 0;

	if (timestamp < 978307200000) {
		return timestamp * 1000;
	}

	return timestamp;
};

/**
 * @deprecated Use logSubscriptionScheduleAction from billing/v2/providers/stripe/utils/subscriptionSchedules instead
 */
export const logPhases = async ({
	phases,
	db,
}: {
	phases: Stripe.SubscriptionScheduleUpdateParams.Phase[];
	db: DrizzleCli;
}) => {
	for (const phase of phases) {
		// @ts-expect-error
		const timestampInMillis = ensureMilliseconds(phase.start_date);
		const endDateInMillis = ensureMilliseconds(phase.end_date as number);
		console.log(
			`Phase ${formatMs(timestampInMillis)} to ${formatMs(endDateInMillis)}:`,
		);
		await logPhaseItems({ items: phase.items, db });
	}
};
