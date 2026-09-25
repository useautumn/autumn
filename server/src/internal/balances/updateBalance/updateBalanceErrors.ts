import {
	ErrCode,
	notNullish,
	RecaseError,
	type UpdateBalanceParamsV0,
} from "@autumn/shared";

/** Names the filter that narrowed the lookup, so a typo reads as a typo. */
const describeBalanceLookup = ({
	params,
}: {
	params: UpdateBalanceParamsV0;
}): string => {
	const narrowedBy: string[] = [];
	if (notNullish(params.balance_id)) {
		narrowedBy.push(`balance_id '${params.balance_id}'`);
	}
	if (notNullish(params.customer_entitlement_id)) {
		narrowedBy.push(
			`customer_entitlement_id '${params.customer_entitlement_id}'`,
		);
	}
	if (notNullish(params.interval)) {
		narrowedBy.push(`interval '${params.interval}'`);
	}
	if (notNullish(params.entity_id)) {
		narrowedBy.push(`entity_id '${params.entity_id}'`);
	}

	return narrowedBy.length > 0 ? ` matching ${narrowedBy.join(", ")}` : "";
};

/** No row under the feature or the rows that fund it: a typo, an unassigned feature, or a drained grant. */
export const balanceNotFoundError = ({
	params,
}: {
	params: UpdateBalanceParamsV0;
}): RecaseError =>
	new RecaseError({
		message:
			`No balance found for feature '${params.feature_id}' on customer '${params.customer_id}'${describeBalanceLookup({ params })}. ` +
			"Call billing.attach to assign a plan that includes this feature, or balances.create to add a standalone grant.",
		code: ErrCode.CustomerEntitlementNotFound,
		statusCode: 404,
	});

export const lifetimeBalanceResetError = ({
	params,
}: {
	params: UpdateBalanceParamsV0;
}): RecaseError =>
	new RecaseError({
		message: `Cannot update next reset at for lifetime balance (feature ${params.feature_id}, customer ${params.customer_id})`,
		statusCode: 400,
	});

export const paidRecurringExpiryError = ({
	params,
}: {
	params: UpdateBalanceParamsV0;
}): RecaseError =>
	new RecaseError({
		message: `expires_at cannot be set on a paid recurring balance (feature ${params.feature_id}); its lifetime follows the billing cycle`,
		statusCode: 400,
	});
