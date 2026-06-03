import type {
	MigrationItemKind,
	MigrationRun,
	MigrationRunStatus,
} from "@autumn/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { useQueryKeyFactory } from "@/hooks/common/useQueryKeyFactory";
import { useAxiosInstance } from "@/services/useAxiosInstance";

const ACTIVE_STATUSES: MigrationRunStatus[] = ["queued", "running"];
const POLL_MS = 30000;

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

export type MigrationRunItemCounts = {
	total: number;
	running: number;
	succeeded: number;
	skipped: number;
	failed: number;
	completed: number;
};

export type MigrationRunWithItemCounts = MigrationRun & {
	item_run_counts?: MigrationRunItemCounts;
};

function findActiveRun(
	runs: MigrationRunWithItemCounts[],
): MigrationRunWithItemCounts | undefined {
	return runs.find((r) => ACTIVE_STATUSES.includes(r.status));
}

export const useMigrationRunsQuery = ({
	migrationId,
	migrationRunId,
	itemIds,
	enabled = true,
}: {
	migrationId: string;
	migrationRunId?: string;
	itemIds?: string[];
	enabled?: boolean;
}) => {
	const axiosInstance = useAxiosInstance();
	const queryClient = useQueryClient();
	const buildKey = useQueryKeyFactory();
	const runsQueryKey = buildKey(["migration-runs", migrationId]);
	const stableItemIds = itemIds ? [...itemIds].sort().join(",") : "all";
	const eventsQueryKey = buildKey([
		"migration-item-events",
		migrationId,
		migrationRunId ?? "all",
		stableItemIds,
	]);

	const runsQuery = useQuery<{ list: MigrationRunWithItemCounts[] }>({
		queryKey: runsQueryKey,
		queryFn: async () => {
			const { data } = await axiosInstance.post<{
				list: MigrationRunWithItemCounts[];
			}>("/migrations.runs.list", { migrationId });
			return data;
		},
		enabled,
		refetchOnWindowFocus: true,
		staleTime: 0,
		refetchInterval: POLL_MS,
	});

	const activeRun = findActiveRun(runsQuery.data?.list ?? []);
	const isActive = !!activeRun;

	const eventsQuery = useQuery<{ list: MigrationItemEvent[] }>({
		queryKey: eventsQueryKey,
		queryFn: async () => {
			const { data } = await axiosInstance.post<{
				list: MigrationItemEvent[];
			}>("/migrations.item_events.list", {
				migrationId,
				migrationRunId,
				itemIds,
			});
			return data;
		},
		enabled,
		refetchOnWindowFocus: true,
		staleTime: 0,
		refetchInterval: POLL_MS,
	});

	const invalidate = useCallback(() => {
		queryClient.invalidateQueries({ queryKey: runsQueryKey });
		queryClient.invalidateQueries({ queryKey: eventsQueryKey });
	}, [queryClient, runsQueryKey, eventsQueryKey]);

	return {
		runs: (runsQuery.data?.list ?? []) as MigrationRunWithItemCounts[],
		isLoadingRuns: runsQuery.isLoading,
		isActive,
		activeRunDryRun: activeRun?.dry_run ?? null,
		activeRunOnlyIds: activeRun?.only_ids ?? null,
		itemEvents: (eventsQuery.data?.list ?? []) as MigrationItemEvent[],
		isLoadingEvents: eventsQuery.isLoading,
		invalidate,
	};
};
