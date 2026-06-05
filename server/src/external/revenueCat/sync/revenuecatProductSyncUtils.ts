import {
	AppEnv,
	BillingInterval,
	type FullProduct,
	type Organization,
	isFixedPrice,
	orgToCurrency,
	type RevenueCatProcessorConfig,
} from "@autumn/shared";
import type { RevenueCatStoreDuration } from "../revenuecatTypes.js";

/** Autumn's base (flat) price for a plan, as RevenueCat micros + currency. Null when free/usage-only. */
export const getRcBasePrice = ({
	product,
	org,
}: {
	product: FullProduct;
	org: Organization;
}): { amountMicros: number; currency: string } | null => {
	const base = product.prices.find(isFixedPrice);
	const amount = base?.config && "amount" in base.config ? base.config.amount : 0;
	if (!amount || amount <= 0) return null;
	return {
		amountMicros: Math.round(amount * 1_000_000),
		currency: orgToCurrency({ org }).toUpperCase(),
	};
};

/** Push is available once the org connected RevenueCat via OAuth for this env. */
export const isRevenueCatPushEnabled = ({
	revenueCatConfig,
	env,
}: {
	revenueCatConfig: RevenueCatProcessorConfig;
	env: AppEnv;
}): boolean =>
	env === AppEnv.Live
		? !!revenueCatConfig.oauth
		: !!revenueCatConfig.sandbox_oauth;

/** Version-stable, env-scoped store identifier Autumn mints for a pushed plan. */
export const getRcStoreIdentifier = ({
	env,
	orgId,
	planId,
}: {
	env: AppEnv;
	orgId: string;
	planId: string;
}): string => `autumn.${env}.${orgId}.${planId}`;

/** Apple subscription group name for create_in_store. */
export const getSubscriptionGroupName = (group?: string | null): string =>
	group && group.length > 0 ? `Autumn - ${group} Group` : "Autumn - Default Group";

/** ISO-8601 duration for createProduct. Null = RC can't represent it (lossy). */
export const autumnIntervalToRcDuration = ({
	interval,
	intervalCount,
}: {
	interval: BillingInterval;
	intervalCount: number;
}): string | null => {
	const count = intervalCount || 1;
	switch (interval) {
		case BillingInterval.Week:
			return count === 1 ? "P1W" : null;
		case BillingInterval.Month:
			if (count === 1) return "P1M";
			if (count === 2) return "P2M";
			if (count === 3) return "P3M";
			if (count === 6) return "P6M";
			if (count === 12) return "P1Y";
			return null;
		case BillingInterval.Quarter:
			return count === 1 ? "P3M" : null;
		case BillingInterval.SemiAnnual:
			return count === 1 ? "P6M" : null;
		case BillingInterval.Year:
			return count === 1 ? "P1Y" : null;
		default:
			return null;
	}
};

/** Enum duration for create_in_store (different format than createProduct). */
export const autumnIntervalToStoreDuration = ({
	interval,
	intervalCount,
}: {
	interval: BillingInterval;
	intervalCount: number;
}): RevenueCatStoreDuration | null => {
	const count = intervalCount || 1;
	switch (interval) {
		case BillingInterval.Week:
			return count === 1 ? "ONE_WEEK" : null;
		case BillingInterval.Month:
			if (count === 1) return "ONE_MONTH";
			if (count === 2) return "TWO_MONTHS";
			if (count === 3) return "THREE_MONTHS";
			if (count === 6) return "SIX_MONTHS";
			if (count === 12) return "ONE_YEAR";
			return null;
		case BillingInterval.Quarter:
			return count === 1 ? "THREE_MONTHS" : null;
		case BillingInterval.SemiAnnual:
			return count === 1 ? "SIX_MONTHS" : null;
		case BillingInterval.Year:
			return count === 1 ? "ONE_YEAR" : null;
		default:
			return null;
	}
};
