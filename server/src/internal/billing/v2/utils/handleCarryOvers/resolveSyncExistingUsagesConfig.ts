import type {
	CarryOverUsages,
	ExistingUsagesConfig,
	FullCusProduct,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { carryOverUsagesToExistingUsagesConfig } from "./carryOverUtils";

/**
 * Carry config for a sync-replaced plan. Unlike attach, sync DEFAULTS to
 * carrying all consumable usage; a disabled rule still carries non-consumables.
 */
export const resolveSyncExistingUsagesConfig = ({
	ctx,
	carryOverUsages,
	currentCustomerProduct,
}: {
	ctx: AutumnContext;
	carryOverUsages?: CarryOverUsages;
	currentCustomerProduct: FullCusProduct;
}): ExistingUsagesConfig => {
	if (carryOverUsages === undefined) {
		return {
			fromCustomerProduct: currentCustomerProduct,
			carryAllConsumableFeatures: true,
		};
	}

	return (
		carryOverUsagesToExistingUsagesConfig({
			ctx,
			params: { carry_over_usages: carryOverUsages },
			currentCustomerProduct,
		}) ?? {
			fromCustomerProduct: currentCustomerProduct,
			carryAllConsumableFeatures: false,
		}
	);
};
