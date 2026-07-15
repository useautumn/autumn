import {
	type FullProduct,
	notNullish,
	type PreviewUpdatePlanParamsV2,
	type ProductV2,
	productsAreSame,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";

export const planWouldVersion = ({
	ctx,
	current,
	incoming,
	updates,
	hasCustomers,
}: {
	ctx: AutumnContext;
	current: FullProduct;
	incoming: ProductV2;
	updates: PreviewUpdatePlanParamsV2;
	hasCustomers: boolean;
}) => {
	if (updates.force_version) return true;
	if (updates.disable_version || updates.all_versions || !hasCustomers) {
		return false;
	}

	const itemsExist = notNullish(updates.items) || "price" in updates;
	const freeTrialProvided = "free_trial" in updates;

	// Billing controls (like other settings) patch in place across all versions
	// and never version on their own.
	if (itemsExist || freeTrialProvided) {
		const { itemsSame, freeTrialsSame } = productsAreSame({
			newProductV2: incoming,
			curProductV1: current,
			features: ctx.features,
		});

		return !(itemsSame && freeTrialsSame);
	}

	return false;
};
