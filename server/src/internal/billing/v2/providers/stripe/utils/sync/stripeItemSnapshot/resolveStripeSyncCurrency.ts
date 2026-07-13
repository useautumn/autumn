import { ErrCode, RecaseError } from "@autumn/shared";
import type Stripe from "stripe";

const schedulePrices = ({
	schedule,
}: {
	schedule?: Stripe.SubscriptionSchedule | null;
}) =>
	(schedule?.phases ?? []).flatMap((phase) =>
		phase.items.flatMap((item) =>
			typeof item.price === "object" && !item.price.deleted ? [item.price] : [],
		),
	);

export const resolveStripeSyncCurrency = ({
	subscription,
	schedule,
	customerCurrency,
}: {
	subscription?: Stripe.Subscription | null;
	schedule?: Stripe.SubscriptionSchedule | null;
	customerCurrency?: string | null;
}): string => {
	const prices = schedulePrices({ schedule });
	const selectedCurrency = (
		subscription?.currency ?? customerCurrency
	)?.toLowerCase();
	if (selectedCurrency) {
		const unsupportedPrice = prices.find(
			(price) =>
				price.currency.toLowerCase() !== selectedCurrency &&
				!price.currency_options?.[selectedCurrency],
		);
		if (unsupportedPrice) {
			throw new RecaseError({
				message: `Stripe Price '${unsupportedPrice.id}' does not support ${selectedCurrency.toUpperCase()}`,
				code: ErrCode.CurrencyMismatch,
				statusCode: 400,
			});
		}
		return selectedCurrency;
	}

	const currencies = new Set(
		prices.flatMap((price) =>
			[price.currency, ...Object.keys(price.currency_options ?? {})].map(
				(currency) => currency.toLowerCase(),
			),
		),
	);
	if (currencies.size !== 1) {
		throw new RecaseError({
			message: "Schedule-only sync currency is ambiguous",
			code: ErrCode.CurrencyMismatch,
			statusCode: 400,
		});
	}
	return currencies.values().next().value!;
};
