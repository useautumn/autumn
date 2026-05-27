import type { Migration } from "@autumn/shared";
import type { MigrationFilter } from "@autumn/shared/api/migrations/filters/migrationFilter.js";
import type { Operations } from "@autumn/shared/api/migrations/operations/operations.js";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useQueryKeyFactory } from "@/hooks/common/useQueryKeyFactory";
import { useAxiosInstance } from "@/services/useAxiosInstance";

interface PrepareModuleResult {
	key: string;
	kind: string;
	result: unknown;
}

interface PrepareResponse {
	migration_id: string;
	dry_run: boolean;
	modules: PrepareModuleResult[];
	warnings: string[];
}

export const useMigrationsQuery = () => {
	const axiosInstance = useAxiosInstance();
	const buildKey = useQueryKeyFactory();
	const queryClient = useQueryClient();
	const queryKey = buildKey(["migrations"]);

	const { data, isLoading, error, refetch } = useQuery<{ list: Migration[] }>({
		queryKey,
		queryFn: async () => {
			const { data } = await axiosInstance.post<{ list: Migration[] }>(
				"/migrations.list",
			);
			return data;
		},
	});

	const invalidate = () => queryClient.invalidateQueries({ queryKey });

	const createMutation = useMutation({
		mutationFn: async (body: {
			id: string;
			filter?: MigrationFilter | null;
			operations?: Operations | null;
			no_billing_changes?: boolean;
		}) => {
			const { data } = await axiosInstance.post<Migration>(
				"/migrations.create",
				body,
			);
			return data;
		},
		onSuccess: invalidate,
	});

	const updateMutation = useMutation({
		mutationFn: async (body: {
			id: string;
			updates: {
				id?: string;
				filter?: MigrationFilter | null;
				operations?: Operations | null;
				retry_failed?: boolean;
				no_billing_changes?: boolean;
			};
		}) => {
			const { data } = await axiosInstance.post<Migration>(
				"/migrations.update",
				body,
			);
			return data;
		},
		onSuccess: invalidate,
	});

	const deleteMutation = useMutation({
		mutationFn: async (body: { id: string }) => {
			const { data } = await axiosInstance.post<Migration>(
				"/migrations.delete",
				body,
			);
			return data;
		},
		onSuccess: invalidate,
	});

	const prepareMutation = useMutation({
		mutationFn: async (body: { id: string; dry_run: boolean }) => {
			const { data } = await axiosInstance.post<PrepareResponse>(
				"/migrations.prepare",
				body,
			);
			return data;
		},
		onSuccess: invalidate,
	});

	const runMutation = useMutation({
		mutationFn: async (body: {
			id: string;
			dry_run?: boolean;
			limit?: number;
			only?: string[];
			concurrency?: number;
			lazy_run?: boolean;
		}) => {
			const { data } = await axiosInstance.post<{
				migration_id: string;
				dry_run: boolean;
				run_id: string;
				trigger_run_id?: string;
				public_access_token?: string;
			}>("/migrations.run", body);
			return data;
		},
		onSuccess: invalidate,
	});

	const cancelRunMutation = useMutation({
		mutationFn: async (body: { id: string }) => {
			const { data } = await axiosInstance.post<{
				migration_id: string;
				run_id: string;
				canceled: boolean;
			}>("/migrations.cancel_run", body);
			return data;
		},
		onSuccess: invalidate,
	});

	return {
		migrations: (data?.list ?? []) as Migration[],
		isLoading,
		error,
		refetch,
		invalidate,
		createMigration: createMutation.mutateAsync,
		isCreating: createMutation.isPending,
		updateMigration: updateMutation.mutateAsync,
		isUpdating: updateMutation.isPending,
		deleteMigration: deleteMutation.mutateAsync,
		isDeleting: deleteMutation.isPending,
		prepareMigration: prepareMutation.mutateAsync,
		isPreparing: prepareMutation.isPending,
		runMigration: runMutation.mutateAsync,
		isRunning: runMutation.isPending,
		cancelRun: cancelRunMutation.mutateAsync,
		isCanceling: cancelRunMutation.isPending,
	};
};
