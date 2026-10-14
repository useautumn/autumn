import {
	type ApiPlanV1,
	AttachAction,
	AttachScenario,
	customerProductToEffectivePrices,
	EligibilityStatus,
	type FullCustomer,
	type FullProduct,
	findActiveCustomerProductById,
	findMainActiveCustomerProductByGroup,
	findScheduledCustomerProductById,
	isCustomerProductCanceling,
	isCustomerProductTrialing,
	productToEffectivePrices,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { getFreeTrialAfterFingerprint } from "../../free-trials/freeTrialUtils.js";
import { isOneOff, isProductUpgrade } from "../../productUtils.js";
import { getAttachScenario } from "./getAttachScenario.js";

const getAttachAction = ({
	fullCus,
	fullProduct,
}: {
	fullCus: FullCustomer;
	fullProduct: FullProduct;
}): AttachAction => {
	if (isOneOff(fullProduct.prices)) {
		return AttachAction.Purchase;
	}

	const internalEntityId = fullCus.entity?.internal_id;

	const activeCusProduct = findActiveCustomerProductById({
		fullCus,
		productId: fullProduct.id,
		internalEntityId,
	});

	const scheduledCusProduct = findScheduledCustomerProductById({
		fullCustomer: fullCus,
		productId: fullProduct.id,
		internalEntityId,
	});

	if (activeCusProduct || scheduledCusProduct) {
		return AttachAction.None;
	}

	if (fullProduct.is_add_on) {
		return AttachAction.Activate;
	}

	const curMainCusProduct = findMainActiveCustomerProductByGroup({
		fullCus,
		productGroup: fullProduct.group,
		internalEntityId,
	});

	if (!curMainCusProduct) {
		return AttachAction.Activate;
	}

	const isUpgrade = isProductUpgrade({
		prices1: customerProductToEffectivePrices({
			customerProduct: curMainCusProduct,
		}),
		prices2: productToEffectivePrices({ product: fullProduct }),
	});

	return isUpgrade ? AttachAction.Upgrade : AttachAction.Downgrade;
};

export const buildCustomerEligibility = async ({
	ctx,
	fullCus,
	fullProduct,
}: {
	ctx?: AutumnContext;
	fullCus?: FullCustomer;
	fullProduct: FullProduct;
}): Promise<ApiPlanV1["customer_eligibility"]> => {
	if (!fullCus) return undefined;

	const internalEntityId = fullCus.entity?.internal_id;

	const activeCusProduct = findActiveCustomerProductById({
		fullCus,
		productId: fullProduct.id,
		internalEntityId,
	});

	const scheduledCusProduct = findScheduledCustomerProductById({
		fullCustomer: fullCus,
		productId: fullProduct.id,
		internalEntityId,
	});

	const attachAction = getAttachAction({ fullCus, fullProduct });

	const scenario = getAttachScenario({ fullCus, fullProduct });

	let trialAvailable: boolean | undefined;
	if (!fullProduct.free_trial) {
		trialAvailable = undefined;
	} else if (ctx) {
		const trial = await getFreeTrialAfterFingerprint({
			db: ctx.db,
			freeTrial: fullProduct.free_trial,
			fingerprint: fullCus.fingerprint,
			internalCustomerId: fullCus.internal_id,
			internalEntityId,
			multipleAllowed: false,
			productId: fullProduct.id,
		});

		trialAvailable = scenario !== AttachScenario.Downgrade && !!trial;
	} else {
		trialAvailable = true;
	}

	const status = activeCusProduct
		? EligibilityStatus.Active
		: scheduledCusProduct
			? EligibilityStatus.Scheduled
			: undefined;

	return {
		object: "customer_eligibility" as const,
		scenario,
		attach_action: attachAction,
		status,
		canceling: activeCusProduct
			? isCustomerProductCanceling(activeCusProduct)
			: undefined,
		trialing: activeCusProduct
			? !!isCustomerProductTrialing(activeCusProduct)
			: undefined,
		trial_available: trialAvailable,
	};
};
