import type { AxiosError } from "axios";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import {
	type RetryableMigrationItemRunStatus,
	useMigrationsQuery,
} from "@/hooks/queries/useMigrationsQuery";
import { getBackendErr } from "@/utils/genUtils";
import { buildRunMigrationRequest } from "./buildRunMigrationRequest";
import type { RealtimeRunSubscription } from "./useMigrationRunRealtime";

const SETTLE_WINDOW_MS = 15000;

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
	const [isSettling, setIsSettling] = useState(false);

	const handleComplete = useCallback(
		(triggerRunId: string) => {
			setSubscriptions((prev) =>
				prev.filter((s) => s.triggerRunId !== triggerRunId),
			);
			setIsSettling(true);
			window.setTimeout(() => setIsSettling(false), SETTLE_WINDOW_MS);
			invalidateRuns();
		},
		[invalidateRuns],
	);

	const triggerRun = async ({
		dryRun,
		limit,
		only,
		retryItemStatuses,
	}: {
		dryRun: boolean;
		limit?: number;
		only?: string[];
		retryItemStatuses?: RetryableMigrationItemRunStatus[];
	}) => {
		try {
			const result = await runMigration(
				buildRunMigrationRequest({
					migrationId,
					dryRun,
					limit,
					only,
					retryItemStatuses,
				}),
			);
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
		isSettling,
		handleComplete,
		triggerRun,
		isRunning,
	};
}
