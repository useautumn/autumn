import type { SubscriptionVerifyResult } from "@autumn/shared";
import { CheckCircleIcon } from "@phosphor-icons/react";
import { getCoreRowModel, useReactTable } from "@tanstack/react-table";
import { useMemo } from "react";
import { Table } from "@/components/general/table";
import { createVerifyMismatchColumns } from "./VerifyStripeColumns";
import {
	resultToDisplayStatus,
	VerifyStripeStatusBadge,
} from "./VerifyStripeStatusBadge";

export function SubscriptionVerifyGroup({
	result,
}: {
	result: SubscriptionVerifyResult;
}) {
	const columns = useMemo(() => createVerifyMismatchColumns(), []);

	const table = useReactTable({
		data: result.mismatches,
		columns,
		getCoreRowModel: getCoreRowModel(),
		enableSorting: false,
	});

	return (
		<div>
			<div className="flex items-center justify-between gap-3 pb-2">
				<span className="text-xs font-mono text-tertiary-foreground truncate min-w-0">
					{result.stripe_subscription_id}
				</span>
				<div className="shrink-0">
					<VerifyStripeStatusBadge status={resultToDisplayStatus(result)} />
				</div>
			</div>

			{result.mismatches.length === 0 ? (
				<div className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2.5 text-xs text-tertiary-foreground">
					<CheckCircleIcon
						size={12}
						weight="fill"
						className="shrink-0 text-green-500"
					/>
					Matches Autumn's expected state
				</div>
			) : (
				<div className="rounded-lg border shadow-card overflow-hidden">
					<Table.Provider
						config={{
							table,
							numberOfColumns: columns.length,
							isLoading: false,
							enableSorting: false,
							flexibleTableColumns: true,
						}}
					>
						<Table.Container>
							<Table.Content className="!rounded-none !border-0 !shadow-none">
								<Table.Header />
								<Table.Body />
							</Table.Content>
						</Table.Container>
					</Table.Provider>
				</div>
			)}
		</div>
	);
}
