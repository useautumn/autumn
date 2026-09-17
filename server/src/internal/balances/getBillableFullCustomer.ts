import {
	ACTIVE_STATUSES,
	type FullCustomer,
	fullSubjectToFullCustomer,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { CusService } from "@/internal/customers/CusService.js";
import { getCachedFullSubject } from "@/internal/customers/cache/fullSubject/actions/getCachedFullSubject.js";
import { getFullSubjectNormalized } from "@/internal/customers/repos/getFullSubject/index.js";

/** Cache first, then the subject query, then the customer table as a fallback. */
export const getBillableFullCustomer = async ({
	ctx,
	customerId,
	source,
}: {
	ctx: AutumnContext;
	customerId: string;
	source: string;
}): Promise<FullCustomer | undefined> => {
	// A Redis failure is just a cache miss here — the DB paths below cover it.
	const cachedFullSubject = await getCachedFullSubject({
		ctx,
		customerId,
		source,
	})
		.then((result) => result.fullSubject)
		.catch(() => null);

	if (cachedFullSubject) {
		return fullSubjectToFullCustomer({ fullSubject: cachedFullSubject });
	}

	const normalizedFullSubject = await getFullSubjectNormalized({
		ctx,
		customerId,
		inStatuses: ACTIVE_STATUSES,
	});

	if (normalizedFullSubject) {
		return fullSubjectToFullCustomer({
			fullSubject: normalizedFullSubject.fullSubject,
		});
	}

	return CusService.getFull({
		ctx,
		idOrInternalId: customerId,
		inStatuses: ACTIVE_STATUSES,
		withSubs: true,
	});
};
