import {
	type FullSubject,
	fullSubjectToUsageWindowLimits,
	orgToInStatuses,
	type UsageWindowLimit,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";

export const resolveUsageWindowLimits = ({
	ctx,
	fullSubject,
	featureIds,
}: {
	ctx: AutumnContext;
	fullSubject: FullSubject;
	featureIds: string[];
}): UsageWindowLimit[] =>
	fullSubjectToUsageWindowLimits({
		fullSubject,
		featureIds,
		features: ctx.features,
		now: ctx.timestamp,
		inStatuses: orgToInStatuses({ org: ctx.org }),
	});
