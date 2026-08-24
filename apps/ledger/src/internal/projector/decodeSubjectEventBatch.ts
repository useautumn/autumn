import { LedgerEntrySchema } from "../../api/journal/types/ledgerEntry.js";
import type { CustomerEntryGroup } from "./types/customerEntryGroup.js";
import type { ProjectorContext } from "./types/projectorContext.js";
import type { SubjectEventBatch } from "./types/subjectEventBatch.js";

// The one place a journal record becomes a typed entry. A record the schema
// rejects is skipped loudly: the projection would be guesswork otherwise.
export const decodeSubjectEventBatch = ({
	ctx,
	batch,
}: {
	ctx: ProjectorContext;
	batch: SubjectEventBatch;
}): CustomerEntryGroup["entries"] => {
	const decoded: CustomerEntryGroup["entries"] = [];

	for (const record of batch.records) {
		const parsed = LedgerEntrySchema.safeParse(record.value);
		if (!parsed.success) {
			ctx.logger.error("Ledger projector could not decode a record", {
				event: "ledger.projector_decode_failed",
				data: {
					partition: batch.partition,
					offset: record.offset,
					issues: parsed.error.issues,
				},
			});
			continue;
		}

		decoded.push({ entry: parsed.data, offset: Number(record.offset) });
	}

	return decoded;
};
