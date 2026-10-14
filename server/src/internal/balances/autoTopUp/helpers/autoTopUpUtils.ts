import type {
	Feature,
	FeatureOptions,
	FullCusEntWithFullCusProduct,
} from "@autumn/shared";
import { Decimal } from "decimal.js";
import { buildBillingLockKey } from "@/internal/billing/v2/utils/billingLock/buildBillingLockKey";

export const buildAutoTopUpLockKey = ({
	orgId,
	env,
	customerId,
}: {
	orgId: string;
	env: string;
	customerId: string;
}) => {
	return buildBillingLockKey({
		orgId,
		env,
		customerId,
	});
};

const featureMatchesOption = ({
	feature,
	option,
}: {
	feature: Feature;
	option: FeatureOptions;
}) =>
	option.internal_feature_id === feature.internal_id ||
	option.feature_id === feature.id;

export const buildUpdatedOptions = ({
	cusProduct,
	feature,
	topUpPacks,
}: {
	cusProduct: FullCusEntWithFullCusProduct["customer_product"];
	feature: Feature;
	topUpPacks: number;
}): FeatureOptions[] => {
	if (!cusProduct) return [];

	const options = cusProduct.options ?? [];
	let matched = false;

	const nextOptions = options.map((opt) => {
		if (featureMatchesOption({ feature, option: opt })) {
			matched = true;
			return {
				...opt,
				quantity: new Decimal(opt.quantity || 0).add(topUpPacks).toNumber(),
			};
		}
		return opt;
	});

	if (matched) return nextOptions;

	return [
		...nextOptions,
		{
			feature_id: feature.id,
			internal_feature_id: feature.internal_id,
			quantity: topUpPacks,
		},
	];
};
