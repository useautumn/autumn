import {
	EntityErrorCode,
	ErrCode,
	type FullCustomer,
	fullSubjectToFullCustomer,
	RecaseError,
	tryCatch,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { readBalanceWorkerSubject } from "@/internal/balanceWorker/subject/readBalanceWorkerSubject.js";
import { CusService } from "@/internal/customers/CusService.js";
import { getOrSetCachedFullSubject } from "@/internal/customers/cache/fullSubject/actions/getOrSetCachedFullSubject.js";
import { isBalanceWorkerRolloutEnabled } from "@/internal/misc/rollouts/isBalanceWorkerRolloutEnabled.js";

/** A missing customer or entity is the answer, not a failed read: Postgres would say the same. */
export const isSubjectNotFound = (error: unknown): boolean =>
	error instanceof RecaseError &&
	(error.code === ErrCode.CustomerNotFound ||
		error.code === EntityErrorCode.EntityNotFound);

/** The subject as a balance write should see it: the worker's live rows when it holds them, else the FullSubject cache. Postgres only if that read fails. */
export const getSubjectFullCustomer = async ({
	ctx,
	customerId,
	entityId,
	source,
}: {
	ctx: AutumnContext;
	customerId: string;
	entityId?: string;
	source: string;
}): Promise<FullCustomer> => {
	const { data: fullSubject, error } = await tryCatch(
		isBalanceWorkerRolloutEnabled()
			? readBalanceWorkerSubject({ ctx, customerId, entityId })
			: getOrSetCachedFullSubject({ ctx, customerId, entityId, source }),
	);
	if (!error) return fullSubjectToFullCustomer({ fullSubject });
	if (isSubjectNotFound(error)) throw error;

	ctx.logger.warn(`[${source}] Subject read failed, reading Postgres`, {
		error,
	});
	return CusService.getFull({
		ctx,
		idOrInternalId: customerId,
		entityId,
		withEntities: true,
	});
};
