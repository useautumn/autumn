import {
	type CusProductStatus,
	type FullSubject,
	fullSubjectToFullCustomer,
	type NormalizedFullSubject,
	normalizedToFullSubject,
	type SubjectQueryRow,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import type { CustomerBalanceSyncDb } from "@/internal/balances/utils/sync/withCustomerBalanceSyncLock.js";
import { checkPendingMigrationsForCustomer } from "@/internal/migrations/v2/lazy/checkPendingMigrationsForCustomer.js";
import { lazyResetSubjectEntitlements } from "../../actions/resetCustomerEntitlementsV2/lazyResetSubjectEntitlements.js";
import { lazyResetSubjectUsageWindows } from "../../actions/resetUsageWindows/lazyResetSubjectUsageWindows.js";
import { RELEVANT_STATUSES } from "../../cusProducts/CusProductService.js";
import { runWithFullSubjectGate } from "./getFullSubjectGate.js";
import { getFullSubjectQuery } from "./getFullSubjectQuery.js";
import {
	resultToFullSubject,
	subjectQueryRowToNormalized,
} from "./subjectQueryRowToNormalized.js";

/** Fetch full subject from DB and return as FullSubject. Runs lazy reset. */
export async function getFullSubject({
	ctx,
	customerId,
	entityId,
	inStatuses = RELEVANT_STATUSES,
	allowMissingEntity = false,
	balanceSyncDb,
}: {
	ctx: AutumnContext;
	customerId?: string;
	entityId?: string;
	inStatuses?: CusProductStatus[];
	allowMissingEntity?: boolean;
	/** Existing customer balance-sync transaction. Cache-miss rebuilds pass
	 * this so their DB snapshot and any due pooled reset share one lock. */
	balanceSyncDb?: CustomerBalanceSyncDb;
}): Promise<FullSubject | undefined> {
	const { org, env } = ctx;
	const db = balanceSyncDb ?? ctx.db;

	const result = await runWithFullSubjectGate({
		customerId,
		orgId: org.id,
		env,
		logger: ctx.logger,
		queryFn: () =>
			db.execute(
				getFullSubjectQuery({
					orgId: org.id,
					env,
					customerId,
					entityId,
					inStatuses,
					allowMissingEntity,
				}),
			),
	});

	if (!result?.length) return undefined;

	const fullSubject = resultToFullSubject({
		row: result[0] as unknown as SubjectQueryRow,
		entityIdRequested: !!entityId,
		allowMissingEntity,
	});
	await lazyResetSubjectEntitlements({ ctx, fullSubject, balanceSyncDb });
	await lazyResetSubjectUsageWindows({ ctx, fullSubject });
	await checkPendingMigrationsForCustomer({
		ctx,
		fullCustomer: fullSubjectToFullCustomer({ fullSubject }),
	});
	return fullSubject;
}

/** Fetch full subject from DB, run lazy reset, return normalized + fullSubject.
 *  Both normalized and fullSubject are kept in sync after reset. */
export async function getFullSubjectNormalized({
	ctx,
	customerId,
	entityId,
	inStatuses = RELEVANT_STATUSES,
	allowMissingEntity = false,
	balanceSyncDb,
}: {
	ctx: AutumnContext;
	customerId?: string;
	entityId?: string;
	inStatuses?: CusProductStatus[];
	allowMissingEntity?: boolean;
	/** Existing customer balance-sync transaction. Cache-miss rebuilds pass
	 * this so their DB snapshot and any due pooled reset share one lock. */
	balanceSyncDb?: CustomerBalanceSyncDb;
}): Promise<
	{ normalized: NormalizedFullSubject; fullSubject: FullSubject } | undefined
> {
	const { org, env } = ctx;
	const db = balanceSyncDb ?? ctx.db;

	const result = await runWithFullSubjectGate({
		customerId,
		orgId: org.id,
		env,
		logger: ctx.logger,
		queryFn: () =>
			db.execute(
				getFullSubjectQuery({
					orgId: org.id,
					env,
					customerId,
					entityId,
					inStatuses,
					allowMissingEntity,
				}),
			),
	});

	if (!result?.length) return undefined;

	const normalized = subjectQueryRowToNormalized({
		row: result[0] as unknown as SubjectQueryRow,
		entityIdRequested: !!entityId,
		allowMissingEntity,
	});

	const fullSubject = normalizedToFullSubject({ normalized });
	await lazyResetSubjectEntitlements({
		ctx,
		fullSubject,
		normalized,
		balanceSyncDb,
	});
	await lazyResetSubjectUsageWindows({ ctx, fullSubject, normalized });
	await checkPendingMigrationsForCustomer({
		ctx,
		fullCustomer: fullSubjectToFullCustomer({ fullSubject }),
	});

	return { normalized, fullSubject };
}
