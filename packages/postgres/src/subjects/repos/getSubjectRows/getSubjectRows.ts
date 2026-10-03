import { RELEVANT_STATUSES } from "@autumn/shared";
import type { PostgresContext } from "../../../types/postgresClient.js";
import { SubjectRowsInvalidError } from "../../subjectErrors.js";
import { subjectRowsEnvelopeSchema } from "../../types/subjectRowsEnvelope.js";
import type { SubjectRowsRead } from "../../types/subjectRowsRead.js";
import { subjectRowsSql } from "./subjectRowsSql.js";

/**
 * The subject's snapshot at `snapshotVersion` when it has one, else its rows, or both with `rowsBesideSnapshot`;
 * `envelope` null when the customer, or the named entity of it, does not exist.
 */
export const getSubjectRows = async ({
	ctx,
	customerId,
	entityId = null,
	asOfTimestampMs,
	snapshotVersion,
	rowsBesideSnapshot,
}: {
	ctx: PostgresContext;
	customerId: string;
	entityId?: string | null;
	asOfTimestampMs: number;
	snapshotVersion?: number;
	rowsBesideSnapshot?: boolean;
}): Promise<SubjectRowsRead> => {
	const rows = await ctx.db.execute(
		subjectRowsSql({
			ctx,
			customerId,
			entityId,
			statuses: RELEVANT_STATUSES,
			asOfTimestampMs,
			snapshotVersion,
			rowsBesideSnapshot,
		}),
	);
	const snapshot = rows[0]?.snapshot ?? null;
	const envelope = rows[0]?.envelope;
	if (!envelope || typeof envelope !== "object")
		return { snapshot, envelope: null };
	if (!("customer" in envelope) || envelope.customer === null)
		return { snapshot, envelope: null };
	if (entityId && "entity" in envelope && envelope.entity === null)
		return { snapshot, envelope: null };

	const parsed = subjectRowsEnvelopeSchema.safeParse(envelope);
	if (!parsed.success)
		throw new SubjectRowsInvalidError({ issues: parsed.error.issues });
	return { snapshot, envelope: parsed.data };
};
