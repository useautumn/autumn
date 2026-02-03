import type {
	AttachParamsV0,
	FreeTrial,
	FullCustomer,
	FullProduct,
	TrialContext,
} from "@autumn/shared";
import { addDuration, isProductPaidAndRecurring } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { getFreeTrialAfterFingerprint } from "@/internal/products/free-trials/freeTrialUtils";
import { initFreeTrial } from "@/internal/products/free-trials/initFreeTrial";

/**
 * Sets up trial context for the V2 attach flow.
 *
 * Handles three cases:
 * - `params.free_trial === null`: Explicitly disabled, returns undefined
 * - `params.free_trial` defined: Custom override (DB insert deferred to execute phase)
 * - `params.free_trial === undefined`: Uses product's default trial
 *
 * Always checks customer eligibility via fingerprint before returning trial context.
 */
export const setupAttachTrialContext = async ({
	ctx,
	attachProduct,
	fullCustomer,
	currentEpochMs,
	params,
}: {
	ctx: AutumnContext;
	attachProduct: FullProduct;
	fullCustomer: FullCustomer;
	currentEpochMs: number;
	params: AttachParamsV0;
}): Promise<TrialContext | undefined> => {
	const { db, org } = ctx;
	const paramsFreeTrial = params.free_trial as FreeTrial | null | undefined;

	// Case 1: Explicitly disabled (null)
	if (paramsFreeTrial === null) {
		return undefined;
	}

	let freeTrial: FreeTrial | null = null;

	// Case 2: Custom trial override (defined)
	if (paramsFreeTrial !== undefined) {
		// Create in-memory FreeTrial object (DB insert happens in execute phase)
		freeTrial = initFreeTrial({
			freeTrialParams: paramsFreeTrial,
			internalProductId: attachProduct.internal_id,
			isCustom: true,
		});
	}
	// Case 3: Use product default (undefined)
	else {
		freeTrial = attachProduct.free_trial ?? null;
	}

	// No trial to apply
	if (!freeTrial) {
		return undefined;
	}

	// Check customer eligibility via fingerprint
	const eligibleFreeTrial = await getFreeTrialAfterFingerprint({
		db,
		freeTrial,
		productId: attachProduct.id,
		fingerprint: fullCustomer.fingerprint,
		internalCustomerId: fullCustomer.internal_id,
		multipleAllowed: org.config.multiple_trials,
	});

	// Customer not eligible (already used trial)
	if (!eligibleFreeTrial) {
		return undefined;
	}

	// Calculate trial end date
	const trialEndsAt = addDuration({
		now: currentEpochMs,
		durationType: eligibleFreeTrial.duration,
		durationLength: eligibleFreeTrial.length,
	});

	return {
		freeTrial: eligibleFreeTrial,
		trialEndsAt,
		appliesToBilling: isProductPaidAndRecurring(attachProduct),
		cardRequired: eligibleFreeTrial.card_required,
		// Mark as custom if params override was used
		customFreeTrial:
			paramsFreeTrial !== undefined ? eligibleFreeTrial : undefined,
	};
};
