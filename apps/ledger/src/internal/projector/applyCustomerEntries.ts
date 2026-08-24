import {
	ledgerSubjectVersionRepo,
	type PostgresClient,
} from "@autumn/postgres";
import type { LedgerEntry } from "../../api/journal/types/ledgerEntry.js";
import { classifyVersionGuard } from "./classifyVersionGuard.js";
import type { CustomerEntryGroup } from "./types/customerEntryGroup.js";
import type { ProjectorContext } from "./types/projectorContext.js";

const reportSkippedEntry = async ({
	ctx,
	db,
	entry,
}: {
	ctx: ProjectorContext;
	db: PostgresClient;
	entry: LedgerEntry;
}): Promise<void> => {
	const storedVersion = await ledgerSubjectVersionRepo.getVersion({
		db,
		internalCustomerId: entry.internal_customer_id,
	});
	const verdict = classifyVersionGuard({
		entryVersion: entry.version,
		storedVersion,
	});
	if (verdict === "duplicate") return;

	ctx.logger.error("Ledger projector found a version gap", {
		event: "ledger.projector_version_gap",
		data: {
			internal_customer_id: entry.internal_customer_id,
			customer_id: entry.customer_id,
			entry_version: entry.version,
			stored_version: storedVersion ?? null,
		},
	});
};

// One transaction per customer: the cursor only moves from `version - 1`, so
// the balances beside it are always the fold of exactly those entries.
export const applyCustomerEntries = async ({
	ctx,
	partition,
	group,
}: {
	ctx: ProjectorContext;
	partition: number;
	group: CustomerEntryGroup;
}): Promise<void> => {
	await ctx.postgres.transaction(async (tx) => {
		for (const { entry, offset } of group.entries) {
			const advanced = await ledgerSubjectVersionRepo.advanceVersion({
				db: tx,
				internalCustomerId: group.internalCustomerId,
				version: entry.version,
				partition,
				kafkaOffset: offset,
			});
			if (!advanced) {
				await reportSkippedEntry({ ctx, db: tx, entry });
			}
			// entry.changes application lands with the real projection target
			// (customer_entitlements at cutover); phase 1 tracks versions only.
		}
	});
};
