import type { SubscriptionVerifyResult, VerifyResponse } from "@autumn/shared";
import { Button, SmallSpinner } from "@autumn/ui";
import { CheckCircleIcon } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { getCoreRowModel, useReactTable } from "@tanstack/react-table";
import { useMemo } from "react";
import { Table } from "@/components/general/table";
import { SheetHeader } from "@/components/v2/sheets/SharedSheetComponents";
import { useQueryKeyFactory } from "@/hooks/common/useQueryKeyFactory";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { getBackendErr } from "@/utils/genUtils";
import { useCusQuery } from "@/views/customers/customer/hooks/useCusQuery";
import { createVerifyMismatchColumns } from "./VerifyStripeColumns";
import {
	resultToDisplayStatus,
	VerifyStripeStatusBadge,
} from "./VerifyStripeStatusBadge";

function SubscriptionVerifyGroup({
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

export function VerifyStripeSheet() {
	const { customer } = useCusQuery();
	const axiosInstance = useAxiosInstance();
	const buildKey = useQueryKeyFactory();

	const customerId = customer?.id ?? customer?.internal_id ?? "";

	const { data, isLoading, error, refetch, isRefetching } = useQuery({
		queryKey: buildKey(["verify-stripe", customerId]),
		queryFn: async (): Promise<VerifyResponse> => {
			const { data } = await axiosInstance.post("/v1/billing.verify", {
				customer_id: customerId,
			});
			return data;
		},
		enabled: Boolean(customerId),
		gcTime: 0,
		staleTime: 0,
	});

	const subscriptions = data?.subscriptions ?? [];
	const mismatchCount = subscriptions.reduce(
		(count, subscription) => count + subscription.mismatches.length,
		0,
	);

	return (
		<div className="flex flex-col h-full">
			<SheetHeader
				title="Verify Stripe"
				description="Check this customer's Stripe subscriptions against the state Autumn expects"
			/>

			<div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
				{isLoading && (
					<div className="flex items-center justify-center py-12">
						<SmallSpinner size={20} className="text-tertiary-foreground" />
					</div>
				)}

				{Boolean(error) && (
					<div className="flex flex-col items-center gap-3 rounded-lg border border-border border-dashed px-4 py-6 text-center">
						<p className="text-sm text-tertiary-foreground">
							{getBackendErr(error, "Failed to verify Stripe subscriptions")}
						</p>
						<Button
							variant="secondary"
							size="sm"
							type="button"
							isLoading={isRefetching}
							onClick={() => refetch()}
						>
							Try again
						</Button>
					</div>
				)}

				{!isLoading && !error && subscriptions.length === 0 && (
					<div className="rounded-lg border border-border border-dashed px-4 py-6 text-center text-sm text-tertiary-foreground">
						No Stripe subscriptions to verify for this customer.
					</div>
				)}

				{!isLoading && !error && subscriptions.length > 0 && (
					<div className="flex items-center justify-between text-xs text-tertiary-foreground">
						<span>
							{subscriptions.length}{" "}
							{subscriptions.length === 1 ? "subscription" : "subscriptions"}{" "}
							checked
						</span>
						<span className="tabular-nums">
							{mismatchCount === 0
								? "No drift found"
								: `${mismatchCount} ${mismatchCount === 1 ? "issue" : "issues"} found`}
						</span>
					</div>
				)}

				{!isLoading &&
					subscriptions.map((result) => (
						<SubscriptionVerifyGroup
							key={result.stripe_subscription_id}
							result={result}
						/>
					))}
			</div>
		</div>
	);
}
