import type {
	SubjectSnapshotDelete,
	SubjectSnapshotUpsert,
	SubjectSnapshotWrites,
} from "@autumn/postgres";
import type { CommitterConfig, Flush } from "../types/committer.js";
import { writesSnapshots } from "./flushSnapshotGuards.js";
import {
	type CustomerSnapshots,
	claimOf,
	customerEntryOf,
	customerOf,
	deleteRowOf,
	holdSubjectStates,
	upsertRowsOf,
} from "./snapshotRows.js";
import { recordProvesState, stateExceedsCap } from "./snapshotWriteRules.js";

/** One action per customer per flush: upsert the last proven state of each of its subjects, else DELETE the customer. */
export const collectSnapshotWrites = ({
	config,
	flush,
	onSizeCapped,
}: {
	config: Pick<CommitterConfig, "snapshots">;
	flush: Flush;
	onSizeCapped?: (params: { customers: number }) => void;
}): SubjectSnapshotWrites | undefined => {
	if (!config.snapshots || !writesSnapshots({ config })) return undefined;
	const { partitionCount } = config.snapshots;
	const { maxBytes } = config.snapshots.read();
	const byCustomer = new Map<string, CustomerSnapshots>();
	for (const call of flush.calls)
		for (const customer of call.snapshotDrops ?? []) {
			const entry = customerEntryOf({ byCustomer, customer });
			entry.deletes = true;
			entry.claim = claimOf({ call }) ?? entry.claim;
		}
	for (const call of flush.calls)
		for (const record of call.records) {
			const customer = customerOf({ identity: record.mutation.identity });
			const entry = customerEntryOf({ byCustomer, customer });
			entry.claim = undefined;
			if (recordProvesState({ record }))
				holdSubjectStates({ entry, call, record });
			else entry.deletes = true;
		}
	const upserts: SubjectSnapshotUpsert[] = [];
	const deletes: SubjectSnapshotDelete[] = [];
	let cappedCustomers = 0;
	for (const entry of byCustomer.values()) {
		const rows = entry.deletes ? [] : upsertRowsOf({ entry, partitionCount });
		const overCap = rows.some(({ stateJson }) =>
			stateExceedsCap({ stateJson, maxBytes }),
		);
		if (overCap) cappedCustomers += 1;
		const { customer, claim } = entry;
		if (entry.deletes || overCap)
			deletes.push(deleteRowOf({ customer, claim }));
		else upserts.push(...rows);
	}
	if (cappedCustomers > 0) onSizeCapped?.({ customers: cappedCustomers });
	return { upserts, deletes };
};
