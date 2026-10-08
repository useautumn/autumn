import { useQuery } from "@tanstack/react-query";
import { isAxiosError } from "axios";
import { useQueryKeyFactory } from "@/hooks/common/useQueryKeyFactory";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import type { MigrationWithRunInfo } from "./useMigrationsQuery";

export type MigrationDetail = Omit<
	MigrationWithRunInfo,
	"status" | "blocked_by" | "has_live_runs" | "summary"
>;

const MAX_RETRIES = 3;

export const useMigrationQuery = ({ migrationId }: { migrationId: string }) => {
	const axiosInstance = useAxiosInstance();
	const buildKey = useQueryKeyFactory();

	const { data, isLoading, error } = useQuery({
		queryKey: buildKey(["migration", migrationId]),
		queryFn: async () => {
			const { data } = await axiosInstance.post<MigrationDetail>(
				"/migrations.get",
				{ id: migrationId },
			);
			return data;
		},
		retry: (failureCount, error) =>
			!(isAxiosError(error) && error.response?.status === 404) &&
			failureCount < MAX_RETRIES,
	});

	return { migration: data, isLoading, error };
};
