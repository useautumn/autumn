import {
	BillingInterval,
	BillingMethod,
	OnDecrease,
	OnIncrease,
	ResetInterval,
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
} as const;
