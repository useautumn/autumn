import {
	BillingType,
	type FullCustomerPrice,
	formatAmount,
	formatInterval,
	getBillingType,
	priceAmountsForCurrency,
} from "@autumn/shared";

type CustomerProductPricingInput = {
	customer_prices?: FullCustomerPrice[];
	quantity?: number | null;
};

export const formatCustomerProductPrice = ({
	customerProduct,
	currency,
}: {
	customerProduct?: CustomerProductPricingInput;
	currency?: string | null;
}): string | null => {
	const prices =
		customerProduct?.customer_prices?.map(({ price }) => price) ?? [];
	if (prices.length === 0) return null;

	const billingTypes = prices.map(({ config }) => getBillingType(config));
	const fixedPrice = prices.find(({ config }) => {
		const billingType = getBillingType(config);
		return (
			billingType === BillingType.FixedCycle ||
			billingType === BillingType.OneOff
		);
	});
	const suffixes = [
		billingTypes.includes(BillingType.UsageInAdvance) ? "prepaid" : null,
		billingTypes.some(
			(billingType) =>
				billingType === BillingType.UsageInArrear ||
				billingType === BillingType.InArrearProrated,
		)
			? "usage"
			: null,
	].filter((suffix): suffix is string => suffix !== null);

	if (fixedPrice && "amount" in fixedPrice.config) {
		const amount =
			priceAmountsForCurrency({
				config: fixedPrice.config,
				currency,
			}).amount ?? fixedPrice.config.amount;
		const quantity = customerProduct?.quantity ?? 1;
		const formattedAmount = formatAmount({
			currency,
			amount: amount * quantity,
			maxFractionDigits: 2,
		});
		const interval = formatInterval({
			interval: fixedPrice.config.interval,
			intervalCount: fixedPrice.config.interval_count,
			prefix: "/ ",
		});
		const variableSuffix = suffixes.length ? ` + ${suffixes.join(" + ")}` : "";

		return `${formattedAmount}${interval ? ` ${interval}` : ""}${variableSuffix}`;
	}

	if (suffixes.length > 0) {
		return suffixes
			.map((suffix) => `${suffix.charAt(0).toUpperCase()}${suffix.slice(1)}`)
			.join(" + ");
	}

	return null;
};
