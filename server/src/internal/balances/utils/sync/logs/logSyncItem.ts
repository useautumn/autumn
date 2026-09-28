import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { addToExtraLogs } from "@/utils/logging/addToExtraLogs";
import type { RolloverSyncEntry, SyncEntry } from "../syncItemV4";

type SyncItemResult =
	| {
			kind: "synced";
			entries: SyncEntry[];
			rolloverEntries: RolloverSyncEntry[];
			updateCount: number;
			rolloverUpdateCount: number;
	  }
	| { kind: "skipped"; reason: "cache_miss" | "no_entries"; feature?: string };

const formatEntry = (entry: SyncEntry): string => {
	const entitiesStr =
		entry.entities && Object.keys(entry.entities).length > 0
			? `, entities=${Object.keys(entry.entities).length}`
			: "";
	return `${entry.feature_id} (${entry.customer_entitlement_id}): bal=${entry.balance}, adj=${entry.adjustment}${entitiesStr}`;
};

const formatRollover = (entry: RolloverSyncEntry): string => {
	const entitiesStr =
		entry.entities && Object.keys(entry.entities).length > 0
			? `, entities=${Object.keys(entry.entities).length}`
			: "";
	return `${entry.rollover_id}: bal=${entry.balance}, usage=${entry.usage}${entitiesStr}`;
};

export const logSyncItem = ({
	ctx,
	result,
}: {
	ctx: AutumnContext;
	result: SyncItemResult;
}) => {
	if (result.kind === "skipped") {
		addToExtraLogs({
			ctx,
			extras: {
				syncItemV4: {
					skipped: result.feature
						? `${result.reason} (feature=${result.feature})`
						: result.reason,
				},
			},
		});
		return;
	}

	addToExtraLogs({
		ctx,
		extras: {
			syncItemV4: {
				entries: result.entries.map(formatEntry),
				rollovers: result.rolloverEntries.map(formatRollover),
				updated: `${result.updateCount} cus_ents, ${result.rolloverUpdateCount} rollovers`,
			},
		},
	});
};
