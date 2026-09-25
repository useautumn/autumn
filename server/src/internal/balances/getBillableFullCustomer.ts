import {
	ACTIVE_STATUSES,
	ErrCode,
	type FullCustomer,
	fullSubjectToFullCustomer,
	RecaseError,
	tryCatch,
} from "@autumn/shared";
import { getBalanceWorkerRolloutEnabled } from "@/external/balanceWorker/getBalanceWorkerRolloutEnabled.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { readBalanceWorkerSubject } from "@/internal/balanceWorker/subject/readBalanceWorkerSubject.js";
import { CusService } from "@/internal/customers/CusService.js";
import { getCachedFullSubject } from "@/internal/customers/cache/fullSubject/actions/getCachedFullSubject.js";
import { getFullSubjectNormalized } from "@/internal/customers/repos/getFullSubject/index.js";

/** The worker's live view of the customer; one it cannot find is undefined. Fails open to Postgres, which throws if it fails too. */
const readBillableFullCustomerFromWorker = async ({
	ctx,
	customerId,
}: {
	ctx: AutumnContext;
	customerId: string;
}): Promise<FullCustomer | undefined> => {
	const { data: fullSubject, error } = await tryCatch(
		readBalanceWorkerSubject({ ctx, customerId }),
	);
	if (!error) return fullSubjectToFullCustomer({ fullSubject });
	const isCustomerNotFound =
		error instanceof RecaseError && error.code === ErrCode.CustomerNotFound;
	if (isCustomerNotFound) return undefined;

	ctx.logger.warn(
		"[getBillableFullCustomer] Balance worker read failed, reading Postgres",
		{ error },
	);
	return CusService.getFull({
		ctx,
		idOrInternalId: customerId,
		inStatuses: ACTIVE_STATUSES,
		withSubs: true,
	});
};

/** The worker's view when it holds the balances; otherwise cache first, then the subject query, then the customer table. */
export const getBillableFullCustomer = async ({
	ctx,
	customerId,
	source,
}: {
	ctx: AutumnContext;
	customerId: string;
	source: string;
}): Promise<FullCustomer | undefined> => {
	// The worker holds the live balances, so read them there rather than landing its writes and reading Postgres.
	if (getBalanceWorkerRolloutEnabled())
		return readBillableFullCustomerFromWorker({ ctx, customerId });

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
