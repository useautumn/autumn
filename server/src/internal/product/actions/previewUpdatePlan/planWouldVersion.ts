import {
	type FullProduct,
	mapToProductV2,
	notNullish,
	type ProductV2,
	type PreviewUpdatePlanParamsV2,
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

	const currentProductV2 = mapToProductV2({
		product: current,
		features: ctx.features,
	});

	const itemsExist = notNullish(updates.items) || "price" in updates;
	const freeTrialProvided = "free_trial" in updates;
	const billingControlsProvided = "billing_controls" in updates;

	if (billingControlsProvided) {
		const {
			billingControlsSame,
			itemsSame,
			freeTrialsSame,
			detailsSame,
			configSame,
			optionsSame,
			metadataSame,
		} = productsAreSame({
			newProductV2: incoming,
			curProductV2: currentProductV2,
			features: ctx.features,
		});

		const onlyBillingControlsChanged =
			!billingControlsSame &&
			itemsSame &&
			freeTrialsSame &&
			detailsSame &&
			configSame &&
			optionsSame &&
			metadataSame;

		if (onlyBillingControlsChanged) return true;
	}

	if (itemsExist || freeTrialProvided) {
		const { itemsSame, freeTrialsSame, billingControlsSame } = productsAreSame({
			newProductV2: incoming,
			curProductV1: current,
			features: ctx.features,
		});

		return !(itemsSame && freeTrialsSame && billingControlsSame);
	}

	return false;
};
