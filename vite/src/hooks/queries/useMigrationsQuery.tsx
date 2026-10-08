import type {
	Migration,
	MigrationListSummary,
	MigrationStatus,
} from "@autumn/shared";
import { useQuery } from "@tanstack/react-query";
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

export const useMigrationsQuery = ({
	pollWhileActiveMs,
}: {
	pollWhileActiveMs?: number;
} = {}) => {
	const axiosInstance = useAxiosInstance();
	const buildKey = useQueryKeyFactory();

	const { data, isLoading, error, refetch } = useQuery<{
		list: MigrationWithRunInfo[];
	}>({
		queryKey: buildKey(["migrations"]),
		queryFn: async () => {
			const { data } = await axiosInstance.post<{
				list: MigrationWithRunInfo[];
			}>("/migrations.list");
			return data;
		},
		refetchInterval: (query) =>
			pollWhileActiveMs &&
			query.state.data?.list.some(
				(migration) =>
					migration.status === "waiting" || migration.status === "running",
			)
				? pollWhileActiveMs
				: false,
	});

	return {
		migrations: (data?.list ?? []) as MigrationWithRunInfo[],
		isLoading,
		error,
		refetch,
	};
};
