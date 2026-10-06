import { RELEVANT_STATUSES } from "@autumn/shared";
import { z } from "zod/v4";
import type { PostgresContext } from "../../../types/postgresClient.js";
import { SubjectRowsInvalidError } from "../../subjectErrors.js";
import {
	type SubjectRowsEnvelope,
	subjectRowsEnvelopeSchema,
} from "../../types/subjectRowsEnvelope.js";
import { entitySubjectRowsSql } from "./entitySubjectRowsSql.js";

const envelopesSchema = z.array(subjectRowsEnvelopeSchema);

/** One envelope per requested entity that exists for the customer; an unknown id is simply absent. */
export const getEntitySubjectRows = async ({
	ctx,
	customerId,
	entityIds,
	asOfTimestampMs,
}: {
	ctx: PostgresContext;
	customerId: string;
	entityIds: readonly string[];
	asOfTimestampMs: number;
}): Promise<SubjectRowsEnvelope[]> => {
	if (entityIds.length === 0) return [];
	const { rows } = await ctx.db.execute(
		entitySubjectRowsSql({
			ctx,
			customerId,
			entityIds,
			statuses: RELEVANT_STATUSES,
			asOfTimestampMs,
		}),
	);
	const envelopes = rows[0]?.envelopes;
	if (!Array.isArray(envelopes)) return [];
	const parsed = envelopesSchema.safeParse(envelopes);
	if (!parsed.success) {
		throw new SubjectRowsInvalidError({ issues: parsed.error.issues });
	}
	return parsed.data;
};
