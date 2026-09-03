import {
	type DbUsageAlert,
	type Feature,
	type FullSubject,
	fullSubjectToUsageWindowLimits,
	orgToInStatuses,
	type UsageWindowLimit,
	usageLimitFilterKey,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";

/** The enforced cap sharing the alert's (feature, filter) identity, resolved exactly as deduction resolves it. */
export const findUsageWindowLimitForAlert = ({
	ctx,
	alert,
	feature,
	fullSubject,
	now,
}: {
	ctx: AutumnContext;
	alert: DbUsageAlert;
	feature: Feature;
	fullSubject: FullSubject;
	now: number;
}): UsageWindowLimit | undefined => {
	const filterKey = usageLimitFilterKey(alert.filter);
	return fullSubjectToUsageWindowLimits({
		fullSubject,
		featureIds: [feature.id],
		features: ctx.features,
		now,
		inStatuses: orgToInStatuses({ org: ctx.org }),
	}).find((limit) => (limit.filter_key ?? "") === filterKey);
};
