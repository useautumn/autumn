import type { Operations } from "@autumn/shared";
import { useMemo } from "react";
import type { MigrationPreviewCustomer } from "@/hooks/queries/useMigrationFilterPreview";
import { useMigrationRunsQuery } from "@/hooks/queries/useMigrationRunsQuery";
import { useRealtimeSubscriptions } from "../hooks/useRealtimeSubscriptions";
import { CustomerRunSheet } from "./CustomerRunSheet";
import { RealtimeRunWatcher } from "./RealtimeRunWatcher";

export function MigrationCustomerSheet({
	migrationId,
	customer,
	operations,
	noBillingChanges,
}: {
	migrationId: string;
	customer: MigrationPreviewCustomer;
	operations: Operations;
	noBillingChanges: boolean;
}) {
	const {
		itemEvents,
		isActive,
		activeRunDryRun,
		invalidate: invalidateRuns,
	} = useMigrationRunsQuery({ migrationId });

	const {
		subscriptions: realtimeSubscriptions,
		hasActive: hasRealtimeActive,
		isSettling,
		handleComplete: handleRealtimeComplete,
		triggerRun,
		isRunning,
	} = useRealtimeSubscriptions({ migrationId, invalidateRuns });

	const customerEvents = useMemo(
		() =>
			itemEvents.filter(
				(e) => e.item_kind === "customer" && e.item_id === customer.internal_id,
			),
		[itemEvents, customer.internal_id],
	);

	const latestDryEvent = useMemo(() => {
		const dryEvents = customerEvents.filter((e) => e.dry_run);
		if (dryEvents.length === 0) return undefined;
		return dryEvents.reduce((latest, event) =>
			event.timestamp > latest.timestamp ? event : latest,
		);
	}, [customerEvents]);

	const latestLiveEvent = useMemo(() => {
		const liveEvents = customerEvents.filter((e) => !e.dry_run);
		if (liveEvents.length === 0) return undefined;
		return liveEvents.reduce((latest, event) =>
			event.timestamp > latest.timestamp ? event : latest,
		);
	}, [customerEvents]);

	const runIsActive = isActive || hasRealtimeActive || isSettling;
	const customerHasResult =
		(customer.migration_item_run?.status != null &&
			customer.migration_item_run.status !== "running") ||
		latestLiveEvent !== undefined;

	return (
		<>
			{realtimeSubscriptions.map((sub) => (
				<RealtimeRunWatcher
					key={sub.triggerRunId}
					subscription={sub}
					onComplete={handleRealtimeComplete}
				/>
			))}
			<CustomerRunSheet
				customer={customer}
				latestDryEvent={latestDryEvent}
				latestLiveEvent={latestLiveEvent}
				allEvents={customerEvents}
				isActive={runIsActive && !customerHasResult}
				activeRunDryRun={activeRunDryRun}
				isRunning={isRunning}
				isRunInProgress={isRunning || isActive || hasRealtimeActive}
				onTriggerRun={triggerRun}
				operations={operations}
				noBillingChanges={noBillingChanges}
			/>
		</>
	);
}
