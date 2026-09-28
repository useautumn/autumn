import type { SyncProposalV2 } from "@autumn/shared";
import { SmallSpinner } from "@autumn/ui";
import { PlanTraySectionTitle } from "@/components/forms/customer-state/components/tray/PlanTraySectionTitle";
import { useProductsQuery } from "@/hooks/queries/useProductsQuery";
import { useVerifyStripeQuery } from "@/views/customers2/components/verify-stripe/hooks/useVerifyStripeQuery";
import { ProposalCard } from "./ProposalCard";

const proposalKey = (proposal: SyncProposalV2): string =>
	proposal.stripe_subscription_id ??
	proposal.stripe_schedule_id ??
	proposal.stripe_subscription?.id ??
	proposal.stripe_schedule?.id ??
	"";

export function SubscriptionListView({
	proposals,
	isLoading,
	error,
	onSelect,
}: {
	proposals: SyncProposalV2[];
	isLoading: boolean;
	error: unknown;
	onSelect: (proposalIndex: number) => void;
}) {
	const { products } = useProductsQuery();
	const { subscriptions: verifiedSubscriptions, isLoading: isVerifying } =
		useVerifyStripeQuery();
	const productNamesById = Object.fromEntries(
		(products ?? []).map((product) => [product.id, product.name]),
	);
	const mismatchesFor = (proposal: SyncProposalV2) =>
		isVerifying
			? undefined
			: (verifiedSubscriptions.find(
					(subscription) =>
						subscription.stripe_subscription_id ===
						proposal.stripe_subscription_id,
				)?.mismatches ?? []);

	return (
		<div className="flex flex-1 flex-col gap-2 overflow-y-auto px-4 py-3">
			{isLoading && (
				<div className="flex items-center justify-center py-12">
					<SmallSpinner size={20} className="text-tertiary-foreground" />
				</div>
			)}
			{Boolean(error) && (
				<div className="text-sm text-red-500 py-4">
					Failed to load Stripe subscriptions.
				</div>
			)}
			{!isLoading && !error && proposals.length === 0 && (
				<div className="text-sm text-tertiary-foreground py-8 text-center">
					No Stripe subscriptions found for this customer.
				</div>
			)}
			{!isLoading && proposals.length > 0 && (
				<PlanTraySectionTitle
					title="Stripe subscriptions"
					hint={`${proposals.length} found`}
				/>
			)}
			{!isLoading &&
				proposals.map((proposal, index) => (
					<ProposalCard
						key={proposalKey(proposal) || `proposal-${index}`}
						proposal={proposal}
						objectId={proposalKey(proposal)}
						mismatches={mismatchesFor(proposal)}
						productNamesById={productNamesById}
						onSelect={() => onSelect(index)}
					/>
				))}
		</div>
	);
}
