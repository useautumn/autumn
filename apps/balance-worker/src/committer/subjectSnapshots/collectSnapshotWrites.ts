import type {
	SubjectSnapshotCustomer,
	SubjectSnapshotUpsert,
	SubjectSnapshotWrites,
} from "@autumn/postgres";
import type { CommitterConfig, Flush } from "../types/committer.js";
import { writesSnapshots } from "./flushSnapshotGuards.js";
import {
	type CustomerSnapshots,
	customerEntryOf,
	customerOf,
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
		for (const customer of call.snapshotDrops ?? [])
			customerEntryOf({ byCustomer, customer }).deletes = true;
	for (const call of flush.calls)
		for (const record of call.records) {
			const customer = customerOf({ identity: record.mutation.identity });
			const entry = customerEntryOf({ byCustomer, customer });
			if (recordProvesState({ record }))
				holdSubjectStates({ entry, call, record });
			else entry.deletes = true;
		}
	const upserts: SubjectSnapshotUpsert[] = [];
	const deletes: SubjectSnapshotCustomer[] = [];
	let cappedCustomers = 0;
	for (const entry of byCustomer.values()) {
		const rows = entry.deletes ? [] : upsertRowsOf({ entry, partitionCount });
		const overCap = rows.some(({ stateJson }) =>
			stateExceedsCap({ stateJson, maxBytes }),
		);
		if (overCap) cappedCustomers += 1;
		if (entry.deletes || overCap) deletes.push(entry.customer);
		else upserts.push(...rows);
	}
	if (cappedCustomers > 0) onSizeCapped?.({ customers: cappedCustomers });
	return { upserts, deletes };
};
