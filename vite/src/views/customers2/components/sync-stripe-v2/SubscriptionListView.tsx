import type { SyncProposalV2 } from "@autumn/shared";
import { SmallSpinner } from "@autumn/ui";
import { LinkIcon } from "@phosphor-icons/react";
import type Stripe from "stripe";
import { useProductsQuery } from "@/hooks/queries/useProductsQuery";
import { cn } from "@/lib/utils";
import { formatStripeItemPrice } from "./formatStripeItemPrice";
import { StripeStatusBadge } from "./StripeStatusBadge";

const getStripeProductName = ({
	product,
}: {
	product: string | Stripe.Product | Stripe.DeletedProduct | undefined;
}): string | null => {
	if (typeof product === "object" && product && "name" in product) {
		return (product as { name: string }).name;
	}
	return null;
};

const StripeItemRow = ({ item }: { item: Stripe.SubscriptionItem }) => {
	const price = item.price;
	const productName =
		getStripeProductName({ product: price?.product }) ?? "Item";
	const priceLabel = formatStripeItemPrice({ price });
	const quantity = item.quantity ?? 1;
	const showQuantity = quantity > 1 && price?.billing_scheme !== "tiered";

	return (
		<div className="flex items-center justify-between text-xs gap-3">
			<span className="text-muted-foreground truncate min-w-0">
				{productName}
			</span>
			<div className="shrink-0 ml-2 text-tertiary-foreground text-right">
				{priceLabel}
				{showQuantity && <span className="text-subtle"> × {quantity}</span>}
			</div>
		</div>
	);
};

const ScheduleItemRow = ({
	item,
}: {
	item: Stripe.SubscriptionSchedule.Phase.Item;
}) => {
	const rawPrice = item.price as string | Stripe.Price | undefined;
	const price = typeof rawPrice === "object" ? rawPrice : null;
	const productName =
		getStripeProductName({ product: price?.product }) ??
		(typeof rawPrice === "string" ? rawPrice : "Item");
	const priceLabel = formatStripeItemPrice({ price });
	const quantity = item.quantity ?? 1;
	const showQuantity = quantity > 1 && price?.billing_scheme !== "tiered";

	return (
		<div className="flex items-center justify-between text-xs gap-3">
			<span className="text-muted-foreground truncate min-w-0">
				{productName}
			</span>
			<div className="shrink-0 ml-2 text-tertiary-foreground text-right">
				{priceLabel}
				{showQuantity && <span className="text-subtle"> × {quantity}</span>}
			</div>
		</div>
	);
};

const proposalKey = (proposal: SyncProposalV2): string =>
	proposal.stripe_subscription_id ??
	proposal.stripe_schedule_id ??
	proposal.stripe_subscription?.id ??
	proposal.stripe_schedule?.id ??
	"";

const ProposalCard = ({
	proposal,
	onSelect,
	productNamesById,
}: {
	proposal: SyncProposalV2;
	onSelect: () => void;
	productNamesById: Record<string, string>;
}) => {
	const sub = proposal.stripe_subscription;
	const schedule = proposal.stripe_schedule;
	const isLinked = proposal.already_linked_product_id !== null;
	const matchedPlans = proposal.phases[0]?.plans ?? [];
	const objectId = proposalKey(proposal);
	const objectLabel =
		objectId || (schedule ? "Stripe schedule" : "Stripe object");
	const schedulePhaseItems = schedule?.phases[0]?.items ?? [];

	return (
		<button
			type="button"
			onClick={onSelect}
			className={cn(
				"w-full text-left rounded-lg border border-border p-4 space-y-3",
				"hover:border-primary/40 transition-colors bg-card",
			)}
		>
			{isLinked && (
				<div className="flex items-center gap-1.5 text-xs text-amber-600 bg-amber-500/10 px-2 py-1.5 rounded-md">
					<LinkIcon className="size-3.5 shrink-0" weight="bold" />
					Already linked
				</div>
			)}

			<div className="flex items-center justify-between gap-2">
				<span className="min-w-0 text-xs font-mono text-tertiary-foreground truncate">
					{objectLabel}
				</span>
				<StripeStatusBadge proposal={proposal} />
			</div>

			{sub && sub.items.data.length > 0 && (
				<div className="space-y-1.5">
					<span className="text-xs text-tertiary-foreground font-medium">
						Subscription items
					</span>
					<div className="space-y-1">
						{sub.items.data.map((item) => (
							<StripeItemRow key={item.id} item={item} />
						))}
					</div>
				</div>
			)}

			{!sub && schedulePhaseItems.length > 0 && (
				<div className="space-y-1.5">
					<span className="text-xs text-tertiary-foreground font-medium">
						Schedule items
					</span>
					<div className="space-y-1">
						{schedulePhaseItems.map((item, index) => (
							<ScheduleItemRow key={`${objectId}-${index}`} item={item} />
						))}
					</div>
				</div>
			)}

			{matchedPlans.length > 0 && (
				<div className="space-y-1.5">
					<span className="text-xs text-tertiary-foreground font-medium">
						Matched Plans
					</span>
					<div className="space-y-1">
						{matchedPlans.map((plan, index) => {
							const name = productNamesById[plan.plan_id] ?? plan.plan_id;
							const quantity = plan.quantity ?? 1;
							return (
								<div
									key={`${plan.plan_id}-${index}`}
									className="flex items-center justify-between text-xs gap-3"
								>
									<span className="text-muted-foreground truncate">{name}</span>
									{quantity > 1 && (
										<span className="text-subtle shrink-0 ml-2">
											× {quantity}
										</span>
									)}
								</div>
							);
						})}
					</div>
				</div>
			)}
		</button>
	);
};

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
	const productNamesById = Object.fromEntries(
		(products ?? []).map((p) => [p.id, p.name]),
	);

	return (
		<div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
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
			{!isLoading &&
				proposals.map((proposal, index) => (
					<ProposalCard
						key={proposalKey(proposal) || `proposal-${index}`}
						proposal={proposal}
						onSelect={() => onSelect(index)}
						productNamesById={productNamesById}
					/>
				))}
		</div>
	);
}
