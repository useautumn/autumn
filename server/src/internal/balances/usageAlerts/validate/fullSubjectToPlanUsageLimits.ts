import {
	type DbUsageLimit,
	type FullSubject,
	fullSubjectToPlanProducts,
	getPlanBillingControlProducts,
	orgToInStatuses,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";

/** Caps the subject's plans supply, on the statuses enforcement reads. */
export const fullSubjectToPlanUsageLimits = ({
	ctx,
	fullSubject,
}: {
	ctx: AutumnContext;
	fullSubject: FullSubject | null | undefined;
}): DbUsageLimit[] =>
	fullSubject
		? getPlanBillingControlProducts({
				customerProducts: fullSubjectToPlanProducts({ fullSubject }),
				inStatuses: orgToInStatuses({ org: ctx.org }),
			}).flatMap(
				(customerProduct) => customerProduct.product?.usage_limits ?? [],
			)
		: [];
