import {
    type CusProductStatus,
    type FullSubject,
    fullSubjectToFullCustomer,
    type NormalizedFullSubject,
    normalizedToFullSubject,
    type SubjectQueryRow,
} from "@autumn/shared";
import { executePrepared } from "@/db/executePrepared.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
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
import { unpackSubjectEnvelope } from "./unpackSubjectEnvelope.js";

/** Fetch full subject from DB and return as FullSubject. Runs lazy reset. */
export async function getFullSubject({
	ctx,
	customerId,
	entityId,
	inStatuses = RELEVANT_STATUSES,
	allowMissingEntity = false,
}: {
	ctx: AutumnContext;
	customerId?: string;
	entityId?: string;
	inStatuses?: CusProductStatus[];
	allowMissingEntity?: boolean;
}): Promise<FullSubject | undefined> {
	const { db, org, env } = ctx;

	const result = await runWithFullSubjectGate({
		customerId,
		orgId: org.id,
		env,
		logger: ctx.logger,
		queryFn: () =>
			executePrepared({
				db,
				label: "getFullSubject",
				query: getFullSubjectQuery({
					orgId: org.id,
					env,
					customerId,
					entityId,
					inStatuses,
					allowMissingEntity,
				}),
			}),
	});

	const subjectRows = unpackSubjectEnvelope({ rows: result ?? [] });
	if (!subjectRows.length) return undefined;

	const fullSubject = resultToFullSubject({
		row: subjectRows[0],
		entityIdRequested: !!entityId,
		allowMissingEntity,
	});
	await lazyResetSubjectEntitlements({ ctx, fullSubject });
	await lazyResetSubjectUsageWindows({ ctx, fullSubject });
	await checkPendingMigrationsForCustomer({
		ctx,
		fullCustomer: fullSubjectToFullCustomer({ fullSubject }),
	});
	return fullSubject;
}

/** Fetch full subject from DB, run lazy resets by default, return normalized + fullSubject.
 *  Both normalized and fullSubject are kept in sync after reset. */
export async function getFullSubjectNormalized({
	ctx,
	customerId,
	entityId,
	inStatuses = RELEVANT_STATUSES,
	allowMissingEntity = false,
	runLazyResets = true,

}: {
	ctx: AutumnContext;
	customerId?: string;
	entityId?: string;
	inStatuses?: CusProductStatus[];
	allowMissingEntity?: boolean;
	runLazyResets?: boolean;

}): Promise<
	{ normalized: NormalizedFullSubject; fullSubject: FullSubject } | undefined
> {
	const { db, org, env } = ctx;

	const result = await runWithFullSubjectGate({
		customerId,
		orgId: org.id,
		env,
		logger: ctx.logger,
		queryFn: () =>
			executePrepared({
				db,
				label: "getFullSubject",
				query: getFullSubjectQuery({
					orgId: org.id,
					env,
					customerId,
					entityId,
					inStatuses,
					allowMissingEntity,
				}),
			}),
	});

	const subjectRows = unpackSubjectEnvelope({ rows: result ?? [] });
	if (!subjectRows.length) return undefined;

	const normalized = subjectQueryRowToNormalized({
		row: subjectRows[0],
		entityIdRequested: !!entityId,
		allowMissingEntity,
	});

	const fullSubject = normalizedToFullSubject({ normalized });
	if (runLazyResets) {
		await lazyResetSubjectEntitlements({ ctx, fullSubject, normalized });
		await lazyResetSubjectUsageWindows({ ctx, fullSubject, normalized });
		await checkPendingMigrationsForCustomer({
			ctx,
			fullCustomer: fullSubjectToFullCustomer({ fullSubject }),
		});
	}


	return { normalized, fullSubject };
}
