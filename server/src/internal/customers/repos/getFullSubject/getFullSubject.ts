import type {
	CusProductStatus,
	FullSubject,
	NormalizedFullSubject,
	SubjectQueryRow,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { RELEVANT_STATUSES } from "../../cusProducts/CusProductService.js";
import { getFullSubjectQuery } from "./getFullSubjectQuery.js";
import {
	resultToFullSubject,
	subjectQueryRowToNormalized,
} from "./subjectQueryRowToNormalized.js";

/** Fetch full subject from DB and return as FullSubject. */
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

	return resultToFullSubject({ row: result[0] as unknown as SubjectQueryRow });
}

/** Fetch full subject from DB and return as NormalizedFullSubject (for cache write). */
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
}): Promise<NormalizedFullSubject | undefined> {
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

	return subjectQueryRowToNormalized({
		row: result[0] as unknown as SubjectQueryRow,
	});
}
