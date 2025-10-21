import type { FullCusProduct } from "@autumn/shared";
import { differenceInDays, subDays } from "date-fns";
import type Stripe from "stripe";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { PriceService } from "@/internal/products/prices/PriceService.js";
import { formatPrice } from "@/internal/products/prices/priceUtils.js";
import { formatUnixToDate, notNullish } from "@/utils/genUtils.js";

export const cusProductInPhase = ({
	phaseStart,
	phaseStartMillis,
	cusProduct,
}: {
	phaseStart?: number;
	phaseStartMillis?: number;
	cusProduct: FullCusProduct;
}) => {
	// Require customer product to start at most one day before the phase start
	const oneDayBeforeCusProductStartsAt = subDays(
		cusProduct.starts_at,
		1,
	).getTime();
	const finalPhaseStart = phaseStartMillis ?? phaseStart! * 1000;

	// Phase start should happen at after cus product starts at
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

// Price quantity pair
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

// Helper function to convert timestamp to milliseconds if needed
const ensureMilliseconds = (timestamp: number | undefined): number => {
	if (!timestamp) return 0;

	// If timestamp is less than year 2001 in milliseconds (978307200000),
	// it's likely in seconds and needs conversion
	// This threshold works because modern timestamps in seconds are much larger
	if (timestamp < 978307200000) {
		return timestamp * 1000;
	}

	return timestamp;
};

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
		console.log(`Phase ${formatUnixToDate(timestampInMillis)}:`);
		await logPhaseItems({ items: phase.items, db });
	}
};
