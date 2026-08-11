import { Button, SmallSpinner } from "@autumn/ui";
import { SheetHeader } from "@/components/v2/sheets/SharedSheetComponents";
import { getBackendErr } from "@/utils/genUtils";
import { useVerifyStripeQuery } from "./hooks/useVerifyStripeQuery";
import { SubscriptionVerifyGroup } from "./SubscriptionVerifyGroup";

export function VerifyStripeSheet() {
	const {
		subscriptions,
		mismatchCount,
		isLoading,
		error,
		refetch,
		isRefetching,
	} = useVerifyStripeQuery();

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
					!error &&
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
