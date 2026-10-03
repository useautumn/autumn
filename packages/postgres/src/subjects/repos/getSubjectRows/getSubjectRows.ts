import { RELEVANT_STATUSES } from "@autumn/shared";
import type { PostgresContext } from "../../../types/postgresClient.js";
import { SubjectRowsInvalidError } from "../../subjectErrors.js";
import { subjectRowsEnvelopeSchema } from "../../types/subjectRowsEnvelope.js";
import type { SubjectRowsRead } from "../../types/subjectRowsRead.js";
import { subjectRowsSql } from "./subjectRowsSql.js";

/** The subject's snapshot at `snapshotVersion` when it has one, else its rows; `envelope` null when the customer, or the named entity of it, does not exist. */
export const getSubjectRows = async ({
	ctx,
	customerId,
	entityId = null,
	asOfTimestampMs,
	snapshotVersion,
}: {
	ctx: PostgresContext;
	customerId: string;
	entityId?: string | null;
	asOfTimestampMs: number;
	snapshotVersion?: number;
}): Promise<SubjectRowsRead> => {
	const rows = await ctx.db.execute(
		subjectRowsSql({
			ctx,
			customerId,
			entityId,
			statuses: RELEVANT_STATUSES,
			asOfTimestampMs,
			snapshotVersion,
		}),
	);
	const snapshot = rows[0]?.snapshot ?? null;
	if (snapshot !== null) return { snapshot, envelope: null };
	const envelope = rows[0]?.envelope;
	if (!envelope || typeof envelope !== "object")
		return { snapshot: null, envelope: null };
	if (!("customer" in envelope) || envelope.customer === null)
		return { snapshot: null, envelope: null };
	if (entityId && "entity" in envelope && envelope.entity === null)
		return { snapshot: null, envelope: null };

	const parsed = subjectRowsEnvelopeSchema.safeParse(envelope);
	if (!parsed.success)
		throw new SubjectRowsInvalidError({ issues: parsed.error.issues });
	return { snapshot: null, envelope: parsed.data };
};
