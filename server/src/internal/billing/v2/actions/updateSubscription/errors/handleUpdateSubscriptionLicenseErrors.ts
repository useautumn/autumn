import {
	CusProductStatus,
	customerLicenseToUsage,
	ErrCode,
	RecaseError,
	type UpdateSubscriptionBillingContext,
	UpdateSubscriptionIntent,
	type UpdateSubscriptionV1Params,
} from "@autumn/shared";

const throwInvalidRequest = (message: string): never => {
	throw new RecaseError({
		message,
		code: ErrCode.InvalidRequest,
		statusCode: 400,
	});
};

/** Pool-in-place quantity moves: every entry must target an existing pool
 * and may not shrink it below its live assignments. */
const handleLicenseQuantityErrors = ({
	billingContext,
	params,
}: {
	billingContext: UpdateSubscriptionBillingContext;
	params: UpdateSubscriptionV1Params;
}) => {
	if (params.feature_quantities?.length) {
		throwInvalidRequest(
			"license_quantities cannot be combined with feature_quantities in one update.",
		);
	}

	const pools = billingContext.customerProduct.customer_licenses ?? [];
	for (const licenseQuantity of params.license_quantities ?? []) {
		const pool = pools.find(
			(candidate) =>
				candidate.planLicense?.product.id === licenseQuantity.license_plan_id,
		);
		if (!pool) {
			return throwInvalidRequest(
				`Customer has no license pool for ${licenseQuantity.license_plan_id} on this plan.`,
			);
		}

		const used = customerLicenseToUsage({ customerLicense: pool });
		if (licenseQuantity.quantity < used) {
			throwInvalidRequest(
				`license_quantities for ${licenseQuantity.license_plan_id} is below its ${used} active assignments. Release licenses first.`,
			);
		}
	}
};

/** Plan restructures replace the customer product; until license transitions
 * execute on updates, pools may only ride when nothing would strand. */
const handleUpdatePlanLicenseErrors = ({
	billingContext,
	params,
}: {
	billingContext: UpdateSubscriptionBillingContext;
	params: UpdateSubscriptionV1Params;
}) => {
	const { customerProduct, patchContext, fullProducts } = billingContext;
	const pools = customerProduct.customer_licenses ?? [];

	const offeredLicensePlanIds = new Set(
		(fullProducts[0]?.licenses ?? []).map((link) => link.product.id),
	);
	for (const licenseQuantity of params.license_quantities ?? []) {
		if (!offeredLicensePlanIds.has(licenseQuantity.license_plan_id)) {
			throwInvalidRequest(
				`Plan does not offer license ${licenseQuantity.license_plan_id}.`,
			);
		}
	}

	if (pools.length === 0) return;

	if (patchContext?.mode === "new") {
		throwInvalidRequest(
			"Version-changing item customize is not supported on license-backed plans yet.",
		);
	}

	// Expire+insert transitions carry pools across rows, but only for
	// licenses the incoming plan still offers — a dropped license with
	// assigned seats would strand them.
	if (!patchContext) {
		for (const pool of pools) {
			const licensePlanId = pool.planLicense?.product.id;
			const used = customerLicenseToUsage({ customerLicense: pool });
			if (used === 0 || !licensePlanId) continue;
			if (offeredLicensePlanIds.has(licensePlanId)) continue;
			throwInvalidRequest(
				`License changes conflict with active license assignments: ${used} assigned for ${licensePlanId}, but the incoming plan drops the license. Release licenses first.`,
			);
		}
	}
};

export const handleUpdateSubscriptionLicenseErrors = ({
	billingContext,
	params,
}: {
	billingContext: UpdateSubscriptionBillingContext;
	params: UpdateSubscriptionV1Params;
}) => {
	const touchesLicenseParams =
		params.license_quantities !== undefined ||
		params.customize?.upsert_licenses !== undefined;
	if (
		touchesLicenseParams &&
		billingContext.customerProduct.status === CusProductStatus.Scheduled
	) {
		throwInvalidRequest(
			"License changes are not supported on scheduled plans.",
		);
	}

	if (billingContext.intent === UpdateSubscriptionIntent.UpdateLicenseQuantity)
		handleLicenseQuantityErrors({ billingContext, params });

	if (billingContext.intent === UpdateSubscriptionIntent.UpdatePlan)
		handleUpdatePlanLicenseErrors({
			billingContext,
			params,
		});
};
