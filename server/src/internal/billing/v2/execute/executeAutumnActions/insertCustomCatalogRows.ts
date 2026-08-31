import type { AutumnBillingPlan } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { EntitlementService } from "@/internal/products/entitlements/EntitlementService";
import { FreeTrialService } from "@/internal/products/free-trials/FreeTrialService";
import { PriceService } from "@/internal/products/prices/PriceService";

/** Custom catalog rows must exist before any customer row can reference them. */
export const insertCustomCatalogRows = async ({
	ctx,
	autumnBillingPlan,
}: {
	ctx: AutumnContext;
	autumnBillingPlan: AutumnBillingPlan;
}) => {
	const { customPrices, customEntitlements, customFreeTrial } =
		autumnBillingPlan;

	if (customEntitlements) {
		await EntitlementService.insert({ db: ctx.db, data: customEntitlements });
	}

	if (customPrices) {
		await PriceService.insert({ db: ctx.db, data: customPrices });
	}

	if (customFreeTrial) {
		await FreeTrialService.insert({ db: ctx.db, data: customFreeTrial });
	}
};
