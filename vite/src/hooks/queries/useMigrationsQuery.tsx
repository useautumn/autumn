import type { Migration } from "@autumn/shared";
import { useQuery } from "@tanstack/react-query";
import { useQueryKeyFactory } from "@/hooks/common/useQueryKeyFactory";
import { MigrationService } from "@/services/MigrationService";
import { useAxiosInstance } from "@/services/useAxiosInstance";

export const useMigrationsQuery = () => {
	const axiosInstance = useAxiosInstance();
	const buildKey = useQueryKeyFactory();

	const { data, isLoading, error, refetch } = useQuery<{
		list: Migration[];
	}>({
		queryKey: buildKey(["migrations"]),
		queryFn: () => MigrationService.list(axiosInstance),
	});

	return {
		migrations: (data?.list ?? []) as Migration[],
		isLoading,
		error,
		refetch,
	};
};
