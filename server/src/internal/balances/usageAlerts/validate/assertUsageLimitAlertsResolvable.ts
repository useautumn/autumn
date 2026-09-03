import {
	type CusProductStatus,
	type DbUsageAlertLike,
	type DbUsageLimit,
	ErrCode,
	type FullSubject,
	findUnresolvableUsageLimitAlerts,
	fullSubjectToPlanProducts,
	getPlanBillingControlProducts,
	isUsageLimitBasisAlert,
	RecaseError,
} from "@autumn/shared";

const planUsageLimitsOf = ({
	fullSubject,
	inStatuses,
}: {
	fullSubject: FullSubject;
	inStatuses: CusProductStatus[];
}): DbUsageLimit[] =>
	getPlanBillingControlProducts({
		customerProducts: fullSubjectToPlanProducts({ fullSubject }),
		inStatuses,
	}).flatMap((customerProduct) => customerProduct.product?.usage_limits ?? []);

export const writesUsageLimitAlert = (
	usageAlerts: DbUsageAlertLike[] | null | undefined,
): boolean => (usageAlerts ?? []).some(isUsageLimitBasisAlert);

/**
 * A usage_limit alert must point at a cap the subject will see after this
 * write: the caller passes the scope's limits as they will be stored, and the
 * plans enforcement reads are added here. Throws 400 naming the first orphan.
 */
export const assertUsageLimitAlertsResolvable = ({
	usageAlerts,
	scopeUsageLimits,
	fullSubject,
	inStatuses,
}: {
	usageAlerts: DbUsageAlertLike[];
	scopeUsageLimits: Array<DbUsageLimit[] | null | undefined>;
	fullSubject: FullSubject | null | undefined;
	inStatuses: CusProductStatus[];
}): void => {
	if (!writesUsageLimitAlert(usageAlerts)) return;

	const unresolvable = findUnresolvableUsageLimitAlerts({
		usageAlerts,
		usageLimitLists: [
			...scopeUsageLimits,
			fullSubject ? planUsageLimitsOf({ fullSubject, inStatuses }) : [],
		],
	});
	const orphan = unresolvable[0];
	if (!orphan) return;

	throw new RecaseError({
		message: `usage_alerts[${orphan.index}] uses basis usage_limit but no usage limit matches feature ${orphan.usageAlert.feature_id ?? "(any)"} and its filter`,
		code: ErrCode.InvalidRequest,
		statusCode: 400,
	});
};
