import { RELEVANT_STATUSES } from "@autumn/shared";
import type { PostgresContext } from "../../../types/postgresClient.js";
import { SubjectRowsInvalidError } from "../../subjectErrors.js";
import {
	type SubjectRowsEnvelope,
	subjectRowsEnvelopeSchema,
} from "../../types/subjectRowsEnvelope.js";
import { subjectRowsSql } from "./subjectRowsSql.js";

/** Null when the customer does not exist in this org and env. */
export const getSubjectRows = async ({
	ctx,
	customerId,
	asOfTimestampMs,
}: {
	ctx: PostgresContext;
	customerId: string;
	asOfTimestampMs: number;
}): Promise<SubjectRowsEnvelope | null> => {
	const rows = await ctx.db.execute<{ envelope: unknown }>(
		subjectRowsSql({
			ctx,
			customerId,
			statuses: RELEVANT_STATUSES,
			asOfTimestampMs,
		}),
	);
	const envelope = rows[0]?.envelope;
	if (!envelope || typeof envelope !== "object") return null;
	if (!("customer" in envelope) || envelope.customer === null) return null;

	const parsed = subjectRowsEnvelopeSchema.safeParse(envelope);
	if (!parsed.success) {
		throw new SubjectRowsInvalidError({ issues: parsed.error.issues });
	}
	return parsed.data;
};
