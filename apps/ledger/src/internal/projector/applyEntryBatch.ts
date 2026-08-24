import { applyCustomerEntries } from "./applyCustomerEntries.js";
import { decodeSubjectEventBatch } from "./decodeSubjectEventBatch.js";
import { groupEntriesByCustomer } from "./groupEntriesByCustomer.js";
import type { ProjectorContext } from "./types/projectorContext.js";
import type { SubjectEventBatch } from "./types/subjectEventBatch.js";

export const applyEntryBatch = async ({
	ctx,
	batch,
}: {
	ctx: ProjectorContext;
	batch: SubjectEventBatch;
}): Promise<void> => {
	const decoded = decodeSubjectEventBatch({ ctx, batch });

	for (const group of groupEntriesByCustomer({ decoded })) {
		await applyCustomerEntries({ ctx, partition: batch.partition, group });
	}
};
