import type {
	CarryOverUsages,
	ExistingUsagesConfig,
	FullCusProduct,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { carryOverUsagesToExistingUsagesConfig } from "./carryOverUtils";

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
			carryUnlimitedUsage: true,
		};

	const config = carryOverUsagesToExistingUsagesConfig({
		ctx,
		params: { carry_over_usages: carryOverUsages },
		currentCustomerProduct,
	});
	if (!config) return undefined;

	return { ...config, carryUnlimitedUsage: true };
};
