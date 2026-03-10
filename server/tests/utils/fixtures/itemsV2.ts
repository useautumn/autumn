import {
	BillingInterval,
	BillingMethod,
	OnDecrease,
	OnIncrease,
	ResetInterval,
	TierBehavior,
	TierInfinite,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features";

const monthlyPrice = ({
	amount = 20,
	intervalCount,
}: {
	amount?: number;
	intervalCount?: number;
} = {}) => ({
	amount,
	interval: BillingInterval.Month,
	interval_count: intervalCount,
});

const annualPrice = ({
	amount = 200,
	intervalCount,
}: {
	amount?: number;
	intervalCount?: number;
} = {}) => ({
	amount,
	interval: BillingInterval.Year,
	interval_count: intervalCount,
});

const monthlyMessages = ({ included = 100 }: { included?: number } = {}) => ({
	feature_id: TestFeature.Messages,
	included,
	reset: {
		interval: ResetInterval.Month,
	},
});

const monthlyWords = ({ included = 100 }: { included?: number } = {}) => ({
	feature_id: TestFeature.Words,
	included,
	reset: {
		interval: ResetInterval.Month,
	},
});

const dashboard = () => ({
	feature_id: TestFeature.Dashboard,
});

const prepaidMessages = ({
	amount = 10,
	billingUnits = 100,
	included = 0,
}: {
	amount?: number;
	billingUnits?: number;
	included?: number;
} = {}) => ({
	feature_id: TestFeature.Messages,
	included,
	price: {
		amount,
		interval: BillingInterval.Month,
		billing_method: BillingMethod.Prepaid,
		billing_units: billingUnits,
	},
});

const prepaidWords = ({
	amount = 10,
	billingUnits = 100,
	included = 0,
}: {
	amount?: number;
	billingUnits?: number;
	included?: number;
} = {}) => ({
	feature_id: TestFeature.Words,
	included,
	price: {
		amount,
		interval: BillingInterval.Month,
		billing_method: BillingMethod.Prepaid,
		billing_units: billingUnits,
	},
});

const consumableMessages = ({ amount = 1 }: { amount?: number } = {}) => ({
	feature_id: TestFeature.Messages,
	price: {
		amount,
		interval: BillingInterval.Month,
		billing_method: BillingMethod.UsageBased,
		billing_units: 1,
	},
});

const allocatedUsers = ({
	amount = 10,
	included = 0,
}: {
	amount?: number;
	included?: number;
} = {}) => ({
	feature_id: TestFeature.Users,
	included,
	price: {
		amount,
		interval: BillingInterval.Month,
		billing_method: BillingMethod.UsageBased,
		billing_units: 1,
	},
	proration: {
		on_increase: OnIncrease.ProrateImmediately,
		on_decrease: OnDecrease.Prorate,
	},
});

/**
 * Tiered prepaid messages - tier `to` values INCLUDE the included amount.
 * Default: included=100, tiers=[{to:600, amount:10}, {to:"inf", amount:5}]
 * (internally stored as [{to:500}, {to:"inf"}] after subtracting included)
 */
const tieredPrepaidMessages = ({
	included = 100,
	billingUnits = 100,
	tiers = [
		{ to: 600, amount: 10 },
		{ to: TierInfinite, amount: 5 },
	],
}: {
	included?: number;
	billingUnits?: number;
	tiers?: { to: number | typeof TierInfinite; amount: number }[];
} = {}) => ({
	feature_id: TestFeature.Messages,
	included,
	price: {
		tiers,
		interval: BillingInterval.Month,
		billing_method: BillingMethod.Prepaid,
		billing_units: billingUnits,
	},
});

/**
 * Volume prepaid messages - tier `to` values INCLUDE the included amount.
 * Entire quantity is charged at whichever single tier it falls into.
 * Default: included=100, tiers=[{to:600, amount:10}, {to:"inf", amount:5}]
 */
const volumePrepaidMessages = ({
	included = 100,
	billingUnits = 100,
	tiers = [
		{ to: 600, amount: 10 },
		{ to: TierInfinite, amount: 5 },
	],
}: {
	included?: number;
	billingUnits?: number;
	tiers?: { to: number | typeof TierInfinite; amount: number }[];
} = {}) => ({
	feature_id: TestFeature.Messages,
	included,
	price: {
		tiers,
		tier_behavior: TierBehavior.VolumeBased,
		interval: BillingInterval.Month,
		billing_method: BillingMethod.Prepaid,
		billing_units: billingUnits,
	},
});

export const itemsV2 = {
	monthlyPrice,
	annualPrice,
	monthlyMessages,
	monthlyWords,
	dashboard,
	prepaidMessages,
	prepaidWords,
	consumableMessages,
	allocatedUsers,
	tieredPrepaidMessages,
	volumePrepaidMessages,
} as const;
