import { notNullish, type UpdateBalanceParamsV0 } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { getOrSetCachedFullSubject } from "@/internal/customers/cache/fullSubject/actions/getOrSetCachedFullSubject.js";
import { buildCustomerEntitlementFilters } from "../../utils/buildCustomerEntitlementFilters.js";
import { updateIncludedGrantV2 } from "./updateIncludedGrantV2.js";
import { updateNextResetAtV2 } from "./updateNextResetAtV2.js";
import { updateRemainingV2 } from "./updateRemainingV2.js";
import { updateUsageV2 } from "./updateUsageV2.js";

/** Update balance using the FullSubject cache path. */
export const updateBalanceV2 = async ({
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
};
