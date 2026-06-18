import type {
	CarryOverUsages,
	ExistingUsagesConfig,
	FullCusProduct,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { carryOverUsagesToExistingUsagesConfig } from "./carryOverUtils";

/**
 * Resolves the existing-usages carry config for an updateSubscription new product.
 * Unlike attach, update DEFAULTS to carrying all usage when the param is absent.
 * `feature_ids` are global feature IDs, applied per the supplied currentCustomerProduct.
 */
export const resolveUpdateExistingUsagesConfig = ({
	ctx,
	skipExistingUsageCarry,
	carryOverUsages,
	currentCustomerProduct,
}: {
	ctx: AutumnContext;
	skipExistingUsageCarry?: boolean;
	carryOverUsages?: CarryOverUsages;
	currentCustomerProduct: FullCusProduct;
}): ExistingUsagesConfig | undefined => {
	if (skipExistingUsageCarry) return undefined;

	if (carryOverUsages === undefined)
		return {
			fromCustomerProduct: currentCustomerProduct,
			carryAllConsumableFeatures: true,
		};

	return carryOverUsagesToExistingUsagesConfig({
		ctx,
		params: { carry_over_usages: carryOverUsages },
		currentCustomerProduct,
	});
};
