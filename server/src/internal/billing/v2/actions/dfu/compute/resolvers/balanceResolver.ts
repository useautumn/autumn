import {
	entIntvToResetIntv,
	entToPrice,
	type FlashBalance,
	type FullCusProduct,
	type FullCustomerEntitlement,
	isPrepaidPrice,
	type Price,
	RecaseError,
	ResetInterval,
} from "@autumn/shared";

type FilterInterval = NonNullable<FlashBalance["filter"]>["interval"];

const filterIntervalToReset = (interval: FilterInterval): ResetInterval =>
	interval == null ? ResetInterval.OneOff : (interval as ResetInterval);

const matchesFilter = ({
	customerEntitlement,
	prices,
	balance,
}: {
	customerEntitlement: FullCustomerEntitlement;
	prices: Price[];
	balance: FlashBalance;
}): boolean => {
	if (customerEntitlement.feature_id !== balance.feature_id) return false;

	const filter = balance.filter;
	if (filter?.interval !== undefined) {
		const target = filterIntervalToReset(filter.interval);
		const entReset = entIntvToResetIntv({
			entInterval: customerEntitlement.entitlement.interval,
		});
		if (entReset !== target) return false;
	}

	if (filter?.billing_behavior) {
		const price = entToPrice({
			ent: customerEntitlement.entitlement,
			prices,
		});
		const isPrepaidLine = price ? isPrepaidPrice(price) : false;
		const wantsPrepaid = filter.billing_behavior === "prepaid";
		if (isPrepaidLine !== wantsPrepaid) return false;
	}

	return true;
};

/**
 * Applies imaged usage/balance onto the cusProduct's already-allowance-filled
 * cusEnts. Reuses the carryOverUsage clamp: overage stays negative only when the
 * line permits it, otherwise floors at zero.
 */
export const applyFlashBalances = ({
	customerProduct,
	balances,
}: {
	customerProduct: FullCusProduct;
	balances?: FlashBalance[];
}): void => {
	if (!balances?.length) return;

	const prices = customerProduct.customer_prices.map(
		(cusPrice) => cusPrice.price,
	);

	for (const balance of balances) {
		const matches = customerProduct.customer_entitlements.filter(
			(customerEntitlement) =>
				matchesFilter({ customerEntitlement, prices, balance }),
		);

		if (matches.length === 0) {
			throw new RecaseError({
				message: `dfu.flash: no entitlement line matched balance for feature '${balance.feature_id}'`,
				code: "flash_balance_no_match",
				statusCode: 400,
			});
		}
		if (matches.length > 1) {
			throw new RecaseError({
				message: `dfu.flash: balance filter for feature '${balance.feature_id}' matched multiple lines; add a filter to disambiguate`,
				code: "flash_balance_ambiguous",
				statusCode: 400,
			});
		}

		const customerEntitlement = matches[0];

		if (balance.balance !== undefined) {
			customerEntitlement.balance = balance.balance;
		} else if (balance.usage !== undefined) {
			const starting = customerEntitlement.balance ?? 0;
			const remaining = starting - balance.usage;
			customerEntitlement.balance = customerEntitlement.usage_allowed
				? remaining
				: Math.max(0, remaining);
		}

		if (balance.next_reset_at !== undefined) {
			customerEntitlement.next_reset_at = balance.next_reset_at;
		}
	}
};
