import type {
	MigrationItemKind,
	MigrationRun,
	MigrationRunStatus,
} from "@autumn/shared";
import { useQuery } from "@tanstack/react-query";
import { useQueryKeyFactory } from "@/hooks/common/useQueryKeyFactory";
import { useAxiosInstance } from "@/services/useAxiosInstance";

const ACTIVE_STATUSES: MigrationRunStatus[] = ["queued", "running"];
const POLL_INTERVAL_MS = 4000;

export type MigrationItemEventStatus = "succeeded" | "skipped" | "failed";

export interface MigrationItemPreview {
	id?: string | null;
	name?: string | null;
	email?: string | null;
}

export interface MigrationItemEvent {
	timestamp: string;
	org_id: string;
	env: string;
	migration_internal_id: string;
	migration_run_id: string;
	dry_run: boolean;
	item_kind: MigrationItemKind;
	item_id: string;
	item_preview: MigrationItemPreview | null;
	status: MigrationItemEventStatus;
	response: Record<string, unknown> | null;
}

function hasActiveRun(runs: MigrationRun[]): boolean {
	return runs.some((r) => ACTIVE_STATUSES.includes(r.status));
}

export const useMigrationRunsQuery = ({
	migrationId,
	migrationRunId,
	enabled = true,
}: {
	migrationId: string;
	migrationRunId?: string;
	enabled?: boolean;
}) => {
	const axiosInstance = useAxiosInstance();
	const buildKey = useQueryKeyFactory();
	const runsQueryKey = buildKey(["migration-runs", migrationId]);
	const eventsQueryKey = buildKey([
		"migration-item-events",
		migrationId,
		migrationRunId ?? "all",
	]);

	const runsQuery = useQuery<{ list: MigrationRun[] }>({
		queryKey: runsQueryKey,
		queryFn: async () => {
			const { data } = await axiosInstance.post<{ list: MigrationRun[] }>(
				"/migrations.runs.list",
				{ migrationId },
			);
			return data;
		},
		enabled,
		refetchInterval: (query) => {
			const runs = query.state.data?.list;
			if (!runs) return false;
			return hasActiveRun(runs) ? POLL_INTERVAL_MS : false;
		},
	});

	const eventsQuery = useQuery<{ list: MigrationItemEvent[] }>({
		queryKey: eventsQueryKey,
		queryFn: async () => {
			const { data } = await axiosInstance.post<{
				list: MigrationItemEvent[];
			}>("/migrations.item_events.list", { migrationId, migrationRunId });
			return data;
		},
		enabled: enabled && !!migrationRunId,
	});

	return {
		runs: (runsQuery.data?.list ?? []) as MigrationRun[],
		isLoadingRuns: runsQuery.isLoading,
		itemEvents: (eventsQuery.data?.list ?? []) as MigrationItemEvent[],
		isLoadingEvents: eventsQuery.isLoading,
	};
};
