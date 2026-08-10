import type { SubscriptionMismatch, VerifyResponse } from "@autumn/shared";
import { Badge, SmallSpinner } from "@autumn/ui";
import { CheckCircleIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { SheetHeader } from "@/components/v2/sheets/SharedSheetComponents";
import { useQueryKeyFactory } from "@/hooks/common/useQueryKeyFactory";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { getBackendErr } from "@/utils/genUtils";
import { useCusQuery } from "@/views/customers/customer/hooks/useCusQuery";

const MismatchRow = ({ mismatch }: { mismatch: SubscriptionMismatch }) => {
	const isWarning = mismatch.severity === "warning";
	return (
		<div className="flex items-start gap-2 text-xs">
			<WarningCircleIcon
				weight="bold"
				className={
					isWarning
						? "size-3.5 shrink-0 mt-0.5 text-amber-600"
						: "size-3.5 shrink-0 mt-0.5 text-red-500"
				}
			/>
			<span className="text-muted-foreground">{mismatch.message}</span>
		</div>
	);
};

const SubscriptionResultCard = ({
	result,
}: {
	result: VerifyResponse["subscriptions"][number];
}) => {
	const isCorrect = result.status === "correct";
	const hasOnlyWarnings =
		!isCorrect && result.mismatches.every((m) => m.severity === "warning");

	return (
		<div className="rounded-lg border border-border p-4 space-y-3 bg-card">
			<div className="flex items-center justify-between gap-3">
				<span className="text-xs font-mono text-tertiary-foreground truncate min-w-0">
					{result.stripe_subscription_id}
				</span>
				{isCorrect ? (
					<Badge variant="green" className="shrink-0 gap-1">
						<CheckCircleIcon weight="bold" className="size-3.5" />
						In sync
					</Badge>
				) : (
					<Badge
						variant="muted"
						className={
							hasOnlyWarnings
								? "shrink-0 gap-1 text-amber-600"
								: "shrink-0 gap-1 text-red-500"
						}
					>
						<WarningCircleIcon weight="bold" className="size-3.5" />
						{hasOnlyWarnings ? "Warning" : "Mismatched"}
					</Badge>
				)}
			</div>

			{result.mismatches.length > 0 && (
				<div className="space-y-1.5">
					{result.mismatches.map((mismatch, index) => (
						<MismatchRow
							key={`${result.stripe_subscription_id}-${mismatch.type}-${index}`}
							mismatch={mismatch}
						/>
					))}
				</div>
			)}
		</div>
	);
};

export function VerifyStripeSheet() {
	const { customer } = useCusQuery();
	const axiosInstance = useAxiosInstance();
	const buildKey = useQueryKeyFactory();

	const customerId = customer?.id ?? customer?.internal_id ?? "";

	const { data, isLoading, error } = useQuery({
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
	const allCorrect =
		subscriptions.length > 0 &&
		subscriptions.every((s) => s.status === "correct");

	return (
		<div className="flex flex-col h-full">
			<SheetHeader
				title="Verify Stripe"
				description="Check this customer's Stripe subscriptions against the state Autumn expects"
			/>

			<div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
				{isLoading && (
					<div className="flex items-center justify-center py-12">
						<SmallSpinner size={20} className="text-tertiary-foreground" />
					</div>
				)}

				{Boolean(error) && (
					<div className="text-sm text-red-500 py-4">
						{getBackendErr(error, "Failed to verify Stripe subscriptions")}
					</div>
				)}

				{!isLoading && !error && subscriptions.length === 0 && (
					<div className="text-sm text-tertiary-foreground py-8 text-center">
						No Stripe subscriptions to verify for this customer.
					</div>
				)}

				{allCorrect && (
					<div className="flex items-center gap-1.5 text-xs text-green-600 bg-green-500/10 px-2 py-1.5 rounded-md">
						<CheckCircleIcon className="size-3.5 shrink-0" weight="bold" />
						All subscriptions match Autumn's expected state
					</div>
				)}

				{!isLoading &&
					subscriptions.map((result) => (
						<SubscriptionResultCard
							key={result.stripe_subscription_id}
							result={result}
						/>
					))}
			</div>
		</div>
	);
}
