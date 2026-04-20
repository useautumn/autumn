import {
	type CusProductStatus,
	type FullSubject,
	type NormalizedFullSubject,
	normalizedToFullSubject,
	type SubjectQueryRow,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { lazyResetSubjectEntitlements } from "../../actions/resetCustomerEntitlementsV2/lazyResetSubjectEntitlements.js";
import { RELEVANT_STATUSES } from "../../cusProducts/CusProductService.js";
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
}: {
	ctx: AutumnContext;
	customerId?: string;
	entityId?: string;
	inStatuses?: CusProductStatus[];
}): Promise<FullSubject | undefined> {
	const { db, org, env } = ctx;

	const result = await db.execute(
		getFullSubjectQuery({
			orgId: org.id,
			env,
			customerId,
			entityId,
			inStatuses,
		}),
	);

	if (!result?.length) return undefined;

	const fullSubject = resultToFullSubject({
		row: result[0] as unknown as SubjectQueryRow,
	});
	await lazyResetSubjectEntitlements({ ctx, fullSubject });
	return fullSubject;
}

/** Fetch full subject from DB, run lazy reset, return normalized + fullSubject.
 *  Both normalized and fullSubject are kept in sync after reset. */
export async function getFullSubjectNormalized({
	ctx,
	customerId,
	entityId,
	inStatuses = RELEVANT_STATUSES,
}: {
	ctx: AutumnContext;
	customerId?: string;
	entityId?: string;
	inStatuses?: CusProductStatus[];
}): Promise<
	{ normalized: NormalizedFullSubject; fullSubject: FullSubject } | undefined
> {
	const { db, org, env } = ctx;

	const result = await db.execute(
		getFullSubjectQuery({
			orgId: org.id,
			env,
			customerId,
			entityId,
			inStatuses,
		}),
	);

	if (!result?.length) return undefined;

	const normalized = subjectQueryRowToNormalized({
		row: result[0] as unknown as SubjectQueryRow,
	});

	const fullSubject = normalizedToFullSubject({ normalized });
	await lazyResetSubjectEntitlements({ ctx, fullSubject, normalized });

	return { normalized, fullSubject };
}
