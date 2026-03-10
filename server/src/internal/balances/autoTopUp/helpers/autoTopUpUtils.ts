import {
	type Feature,
	type FeatureOptions,
	type FullCusEntWithFullCusProduct,
} from "@autumn/shared";
import { Decimal } from "decimal.js";

/** Build the Redis lock key for auto top-up. Shares the attach lock so auto-topup and attach can't run concurrently. */
export const buildAutoTopUpLockKey = ({
	orgId,
	env,
	customerId,
}: {
	orgId: string;
	env: string;
	customerId: string;
}) => {
	return `lock:attach:${orgId}:${env}:${customerId}`;
};

/** Compute updated options array with the top-up packs added. */
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

	return cusProduct.options.map((opt) => {
		if (
			opt.internal_feature_id === feature.internal_id ||
			opt.feature_id === feature.id
		) {
			return {
				...opt,
				quantity: new Decimal(opt.quantity || 0).add(topUpPacks).toNumber(),
			};
		}
		return opt;
	});
};

export const updateCusEntOptionsInline = ({
	cusEnt,
	feature,
	quantity,
}: {
	cusEnt: FullCusEntWithFullCusProduct;
	feature: Feature;
	quantity: number;
}) => {
	// const cusPrice = cusEntToCusPrice({ cusEnt });
	return {
		...cusEnt,
		customer_product: cusEnt.customer_product
			? {
					...cusEnt.customer_product,
					options: cusEnt.customer_product.options.map((opt) =>
						opt.internal_feature_id === feature.internal_id ||
						opt.feature_id === feature.id
							? { ...opt, quantity }
							: opt,
					),
				}
			: cusEnt.customer_product,
	};
};
