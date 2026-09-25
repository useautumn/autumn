import {
	type FullCusEntWithFullCusProduct,
	type FullSubject,
	fullSubjectToCustomerEntitlements,
	notNullish,
	type UpdateBalanceParamsV0,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { getOrSetCachedFullSubject } from "@/internal/customers/cache/fullSubject/actions/getOrSetCachedFullSubject.js";
import { buildCustomerEntitlementFilters } from "../../utils/buildCustomerEntitlementFilters.js";
import { validateInvoiceCreditBalanceMutationForFeature } from "../../utils/validateInvoiceCreditBalanceMutation.js";
import { balanceNotFoundError } from "../updateBalanceErrors.js";
import { updateExpiresAtV2 } from "./updateExpiresAtV2.js";
import { updateIncludedGrantV2 } from "./updateIncludedGrantV2.js";
import { updateNextResetAtV2 } from "./updateNextResetAtV2.js";
import { updateRemainingV2 } from "./updateRemainingV2.js";
import { updateUsageV2 } from "./updateUsageV2.js";

/**
 * A mutation that resolves no entitlements silently changed nothing and still
 * reported success, so a typo'd balance_id, an unassigned feature and a fully
 * drained grant were indistinguishable from a real update.
 */
const assertBalanceExists = ({
	params,
	fullSubject,
	customerEntitlements,
}: {
	params: UpdateBalanceParamsV0;
	fullSubject: FullSubject;
	customerEntitlements: FullCusEntWithFullCusProduct[];
}) => {
	if (customerEntitlements.length > 0) return;

	// The deduction path resolves by funding membership rather than by catalog
	// feature, so only an empty result under BOTH readings means "nothing here".
	const fundingEntitlements = fullSubjectToCustomerEntitlements({
		fullSubject,
		fundsFeatureId: params.feature_id,
		customerEntitlementFilters: buildCustomerEntitlementFilters({ params }),
	});
	if (fundingEntitlements.length > 0) return;

	throw balanceNotFoundError({ params });
};

const validateBalanceMutation = ({
	params,
	targetBalance,
	fullSubject,
}: {
	params: UpdateBalanceParamsV0;
	targetBalance?: number;
	fullSubject: FullSubject;
}) => {
	const changesBalance =
		notNullish(targetBalance) ||
		notNullish(params.remaining) ||
		notNullish(params.add_to_balance) ||
		notNullish(params.usage) ||
		notNullish(params.included_grant);
	if (!changesBalance) return;

	const customerEntitlements = fullSubjectToCustomerEntitlements({
		fullSubject,
		featureIds: [params.feature_id],
		customerEntitlementFilters: buildCustomerEntitlementFilters({ params }),
	});

	validateInvoiceCreditBalanceMutationForFeature({
		customerEntitlements,
		featureId: params.feature_id,
	});

	assertBalanceExists({ params, fullSubject, customerEntitlements });
};

/** Update balance using the FullSubject cache path: the lane before the balance worker, and its paid allocated fallback. */
export const updateBalanceOnCacheV2 = async ({
	ctx,
	params,
	targetBalance,
}: {
	ctx: AutumnContext;
	params: UpdateBalanceParamsV0;
	targetBalance?: number;
}) => {
	const fullSubject = await getOrSetCachedFullSubject({
		ctx,
		customerId: params.customer_id,
		entityId: params.entity_id,
		source: "handleUpdateBalance",
	});

	validateBalanceMutation({ params, targetBalance, fullSubject });

	if (notNullish(params.add_to_balance) || notNullish(targetBalance)) {
		await updateRemainingV2({ ctx, fullSubject, params });
	}

	if (notNullish(params.usage)) {
		await updateUsageV2({ ctx, fullSubject, params });
	}

	if (notNullish(params.included_grant)) {
		ctx.logger.info(
			`updating granted balance for feature ${params.feature_id} to ${params.included_grant}`,
		);

		const customerEntitlementFilters = buildCustomerEntitlementFilters({
			params,
		});

		await updateIncludedGrantV2({
			ctx,
			fullSubject,
			featureId: params.feature_id,
			targetGrantedBalance: params.included_grant,
			customerEntitlementFilters,
		});
	}

	if (notNullish(params.next_reset_at)) {
		const customerEntitlementFilters = buildCustomerEntitlementFilters({
			params,
		});

		await updateNextResetAtV2({
			ctx,
			fullSubject,
			featureId: params.feature_id,
			nextResetAt: params.next_reset_at,
			customerEntitlementFilters,
		});
	}

	if (notNullish(params.expires_at)) {
		const customerEntitlementFilters = buildCustomerEntitlementFilters({
			params,
		});

		await updateExpiresAtV2({
			ctx,
			fullSubject,
			featureId: params.feature_id,
			expiresAt: params.expires_at,
			customerEntitlementFilters,
		});
	}
};
