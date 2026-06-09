import type { MigrationItemRun } from "@autumn/shared";
import type {
	MigrationItemEvent,
	MigrationItemEventStatus,
} from "@/hooks/queries/useMigrationRunsQuery";

export type ActiveRunStatus = "queued" | "running" | null;

export type MigrationItemStatus =
	| { kind: "running" }
	| { kind: "queued" }
	| {
			kind: "result";
			status: MigrationItemEventStatus;
			dryRun: boolean;
			response: Record<string, unknown> | null;
	  }
	| { kind: "none" };

export function isPreferredEvent(
	candidate: MigrationItemEvent,
	existing: MigrationItemEvent,
) {
	if (candidate.dry_run !== existing.dry_run) return !candidate.dry_run;
	return candidate.timestamp > existing.timestamp;
}

export function buildEventsByCustomer(itemEvents: MigrationItemEvent[]) {
	const map = new Map<string, MigrationItemEvent>();
	for (const event of itemEvents) {
		if (event.item_kind !== "customer") continue;
		const existing = map.get(event.item_id);
		if (!existing || isPreferredEvent(event, existing))
			map.set(event.item_id, event);
	}
	return map;
}

export function resolveMigrationItemStatus({
	event,
	itemRun,
	activeStatus,
}: {
	event: MigrationItemEvent | undefined;
	itemRun: MigrationItemRun | null | undefined;
	activeStatus: ActiveRunStatus;
}): MigrationItemStatus {
	if (activeStatus === "running") return { kind: "running" };
	if (activeStatus === "queued") return { kind: "queued" };

	if (itemRun?.status === "running") return { kind: "running" };

	if (event)
		return {
			kind: "result",
			status: event.status,
			dryRun: event.dry_run,
			response: event.response,
		};

	if (itemRun?.status && itemRun.status !== "running")
		return {
			kind: "result",
			status: itemRun.status,
			dryRun: false,
			response: null,
		};

	return { kind: "none" };
}
