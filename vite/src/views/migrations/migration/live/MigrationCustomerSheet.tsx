import type { CustomerWithProducts } from "@autumn/shared";
import type { AxiosError } from "axios";
import { useMemo } from "react";
import { toast } from "sonner";
import { useMigrationRunsQuery } from "@/hooks/queries/useMigrationRunsQuery";
import { useMigrationsQuery } from "@/hooks/queries/useMigrationsQuery";
import { getBackendErr } from "@/utils/genUtils";
import { CustomerRunSheet } from "./CustomerRunSheet";

export function MigrationCustomerSheet({
	migrationId,
	customer,
}: {
	migrationId: string;
	customer: CustomerWithProducts;
}) {
	const { runMigration, isRunning } = useMigrationsQuery();
	const {
		itemEvents,
		isActive,
		invalidate: invalidateRuns,
	} = useMigrationRunsQuery({ migrationId });

	const customerEvents = useMemo(
		() =>
			itemEvents.filter(
				(e) => e.item_kind === "customer" && e.item_id === customer.internal_id,
			),
		[itemEvents, customer.internal_id],
	);

	const latestEvent = useMemo(() => {
		if (customerEvents.length === 0) return undefined;
		return customerEvents.reduce((latest, event) =>
			event.timestamp > latest.timestamp ? event : latest,
		);
	}, [customerEvents]);

	const triggerRun = async ({
		dryRun,
		only,
	}: {
		dryRun: boolean;
		only?: string[];
	}) => {
		try {
			const result = await runMigration({
				id: migrationId,
				dry_run: dryRun,
				only,
			});
			const label = dryRun ? "Dry run" : "Migration run";
			toast.success(`${label} triggered (${result.run_id})`);
			invalidateRuns();
		} catch (error) {
			toast.error(
				getBackendErr(error as AxiosError, "Failed to run migration"),
			);
		}
	};

	return (
		<CustomerRunSheet
			customer={customer}
			latestEvent={latestEvent}
			allEvents={customerEvents}
			isActive={isActive}
			isRunning={isRunning}
			onTriggerRun={triggerRun}
		/>
	);
}
