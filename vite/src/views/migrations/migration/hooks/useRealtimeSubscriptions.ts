import type { AxiosError } from "axios";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import {
	type RetryableMigrationItemRunStatus,
	useMigrationsQuery,
} from "@/hooks/queries/useMigrationsQuery";
import { getBackendErr } from "@/utils/genUtils";
import type { RealtimeRunSubscription } from "./useMigrationRunRealtime";

export function useRealtimeSubscriptions({
	migrationId,
	invalidateRuns,
}: {
	migrationId: string;
	invalidateRuns: () => void;
}) {
	const { runMigration, isRunning } = useMigrationsQuery();
	const [subscriptions, setSubscriptions] = useState<RealtimeRunSubscription[]>(
		[],
	);

	const handleComplete = useCallback(
		(triggerRunId: string) => {
			setSubscriptions((prev) =>
				prev.filter((s) => s.triggerRunId !== triggerRunId),
			);
			invalidateRuns();
		},
		[invalidateRuns],
	);

	const triggerRun = async ({
		dryRun,
		limit,
		only,
		lazyRun,
		concurrency,
		retryItemStatuses,
	}: {
		dryRun: boolean;
		limit?: number;
		only?: string[];
		lazyRun?: boolean;
		concurrency?: number;
		retryItemStatuses?: RetryableMigrationItemRunStatus[];
	}) => {
		try {
			const isTargetedRun = only !== undefined && only.length > 0;
			const retryStatuses =
				retryItemStatuses && retryItemStatuses.length > 0
					? retryItemStatuses
					: undefined;
			const result = await runMigration({
				id: migrationId,
				dry_run: dryRun,
				limit,
				only,
				lazy_run: isTargetedRun ? false : (lazyRun ?? true),
				concurrency,
				retry_item_statuses:
					retryStatuses ?? (isTargetedRun ? ["failed"] : undefined),
			});
			if (result.trigger_run_id && result.public_access_token) {
				setSubscriptions((prev) => [
					...prev,
					{
						triggerRunId: result.trigger_run_id as string,
						publicAccessToken: result.public_access_token as string,
						isDryRun: dryRun,
					},
				]);
			}
			const label = dryRun ? "Dry run" : "Migration run";
			toast.success(`${label} triggered (${result.run_id})`);
			invalidateRuns();
		} catch (error) {
			toast.error(
				getBackendErr(error as AxiosError, "Failed to run migration"),
			);
		}
	};

	return {
		subscriptions,
		hasActive: subscriptions.length > 0,
		handleComplete,
		triggerRun,
		isRunning,
	};
}
