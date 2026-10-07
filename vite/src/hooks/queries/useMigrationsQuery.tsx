import type {
	Migration,
	MigrationListSummary,
	MigrationStatus,
} from "@autumn/shared";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useQueryKeyFactory } from "@/hooks/common/useQueryKeyFactory";
import { useAxiosInstance } from "@/services/useAxiosInstance";

export type MigrationWithRunInfo = Migration & {
	status: MigrationStatus;
	blocked_by: string | null;
	has_live_runs: boolean;
	/** Whether a plain run of this migration takes the batch lane. */
	batch_eligible: boolean;
	summary: MigrationListSummary;
};

const hasActiveMigration = (migrations: MigrationWithRunInfo[] = []) =>
	migrations.some(
		(migration) =>
			migration.status === "waiting" || migration.status === "running",
	);

/** Customer counts load apart from the list: they cost seconds on large orgs. */
export const useMigrationsQuery = ({
	pollWhileActiveMs,
}: {
	pollWhileActiveMs?: number;
} = {}) => {
	const axiosInstance = useAxiosInstance();
	const buildKey = useQueryKeyFactory();
	const listKey = buildKey(["migrations"]);

	const { data, isLoading, error, refetch } = useQuery<{
		list: MigrationWithRunInfo[];
	}>({
		queryKey: listKey,
		queryFn: async () => {
			const { data } = await axiosInstance.post<{
				list: MigrationWithRunInfo[];
			}>("/migrations.list", { customer_counts: false });
			return data;
		},
		refetchInterval: (query) =>
			pollWhileActiveMs && hasActiveMigration(query.state.data?.list)
				? pollWhileActiveMs
				: false,
	});

	const { data: customerCounts, isLoading: isCountsLoading } = useQuery({
		queryKey: [...listKey, "customer_counts"],
		queryFn: async () => {
			const { data } = await axiosInstance.post<{
				list: { id: string; customer_count: number | null }[];
			}>("/migrations.customer_counts");
			return new Map(data.list.map((row) => [row.id, row.customer_count]));
		},
		refetchInterval:
			pollWhileActiveMs && hasActiveMigration(data?.list)
				? pollWhileActiveMs
				: false,
	});

	const migrations = useMemo(
		() =>
			(data?.list ?? []).map((migration) => ({
				...migration,
				summary: {
					...migration.summary,
					customer_count: customerCounts?.get(migration.id) ?? null,
				},
			})),
		[data, customerCounts],
	);

	return { migrations, isLoading, isCountsLoading, error, refetch };
};
