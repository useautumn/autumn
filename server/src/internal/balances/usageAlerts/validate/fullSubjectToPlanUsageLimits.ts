import {
	type DbUsageLimit,
	type FullSubject,
	fullSubjectToPlanProducts,
	getPlanBillingControlProducts,
	orgToInStatuses,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";

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
