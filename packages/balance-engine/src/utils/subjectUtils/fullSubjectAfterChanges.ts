import type { RowChange } from "../../models/mutation/rowChange.js";
import type {
	WorkerFullCustomerEntitlement,
	WorkerFullCustomerProduct,
	WorkerFullSubject,
} from "../../models/subject/workerFullSubject.js";
import { incrementRow } from "../../mutation/incrementRow.js";

type Patchable = Extract<
	RowChange,
	{ table: "customerEntitlements" | "rollovers" | "usageWindows" | "locks" }
>;

const isPatchable = (change: RowChange): change is Patchable =>
	(change.table === "customerEntitlements" && change.op === "increment") ||
	(change.table === "rollovers" && change.op === "increment") ||
	change.table === "usageWindows" ||
	change.table === "locks";

const patchCustomerEntitlement = ({
	row,
	changes,
}: {
	row: WorkerFullCustomerEntitlement;
	changes: Patchable[];
}): WorkerFullCustomerEntitlement => {
	let next = row;
	for (const change of changes) {
		if (
			change.table === "customerEntitlements" &&
			change.op === "increment" &&
			change.id === next.id
		)
			next = incrementRow({ row: next, change });
		if (change.table === "rollovers" && change.op === "increment") {
			const index = next.rollovers.findIndex(({ id }) => id === change.id);
			if (index === -1) continue;
			const rollovers = [...next.rollovers];
			const rollover = rollovers[index];
			if (!rollover) continue;
			rollovers[index] = incrementRow({ row: rollover, change });
			next = { ...next, rollovers };
		}
	}
	return next;
};

const patchRows = ({
	rows,
	changes,
}: {
	rows: WorkerFullCustomerEntitlement[];
	changes: Patchable[];
}): WorkerFullCustomerEntitlement[] =>
	rows.map((row) => patchCustomerEntitlement({ row, changes }));

/** The joined subject a balance mutation leaves, patched in place of a fresh join; null when a change is one this does not patch. */
export const fullSubjectAfterChanges = ({
	fullSubject,
	changes,
}: {
	fullSubject: WorkerFullSubject;
	changes: RowChange[];
}): WorkerFullSubject | null => {
	if (!changes.every(isPatchable)) return null;
	const patchable = changes as Patchable[];
	const rowChanges = patchable.filter(
		(change) =>
			change.table === "customerEntitlements" || change.table === "rollovers",
	);
	let usageWindows = fullSubject.usage_windows;
	let openLocks = fullSubject.open_locks;
	for (const change of patchable) {
		if (change.table === "usageWindows") {
			if (change.op === "insert") usageWindows = [...usageWindows, change.row];
			else if (change.op === "increment")
				usageWindows = usageWindows.map((window) =>
					window.id === change.id ? incrementRow({ row: window, change }) : window,
				);
			else if (change.op === "update")
				usageWindows = usageWindows.map((window) =>
					window.id === change.id ? { ...window, ...change.after } : window,
				);
			else return null;
		}
		if (change.table === "locks") {
			openLocks =
				change.op === "insert"
					? [...openLocks, { id: change.row.id, lock_id: change.row.lock_id }]
					: openLocks.filter((lock) => lock.id !== change.id);
		}
	}
	return {
		...fullSubject,
		revision: fullSubject.revision + 1,
		customer_products: fullSubject.customer_products.map(
			(customerProduct): WorkerFullCustomerProduct => ({
				...customerProduct,
				customer_entitlements: patchRows({
					rows: customerProduct.customer_entitlements,
					changes: rowChanges,
				}),
			}),
		),
		extra_customer_entitlements: patchRows({
			rows: fullSubject.extra_customer_entitlements,
			changes: rowChanges,
		}),
		pooled_customer_entitlements: patchRows({
			rows: fullSubject.pooled_customer_entitlements,
			changes: rowChanges,
		}),
		usage_windows: usageWindows,
		open_locks: openLocks,
	};
};
