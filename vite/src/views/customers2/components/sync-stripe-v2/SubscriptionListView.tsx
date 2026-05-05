import type { SyncProposalV2 } from "@autumn/shared";
import { LinkIcon } from "@phosphor-icons/react";
import type Stripe from "stripe";
import SmallSpinner from "@/components/general/SmallSpinner";
import { useProductsQuery } from "@/hooks/queries/useProductsQuery";
import { cn } from "@/lib/utils";

const formatStripeCurrency = ({
	amount,
	currency,
}: {
	amount: number;
	currency: string;
}): string => {
	const dollars = amount / 100;
	try {
		return new Intl.NumberFormat("en-US", {
			style: "currency",
			currency: currency.toUpperCase(),
			minimumFractionDigits: dollars % 1 === 0 ? 0 : 2,
			maximumFractionDigits: 2,
		}).format(dollars);
	} catch {
		return `${dollars.toFixed(2)} ${currency.toUpperCase()}`;
	}
};

const formatItemPrice = ({
	price,
}: {
	price: Stripe.Price | null | undefined;
}): string => {
	if (!price) return "—";
	const currency = price.currency ?? "usd";

	if (price.billing_scheme === "tiered") {
		return price.tiers_mode === "volume" ? "Volume" : "Tiered";
	}

	const usageType = price.recurring?.usage_type;
	if (usageType === "metered") {
		if (price.unit_amount != null) {
			return `${formatStripeCurrency({ amount: price.unit_amount, currency })}/unit (metered)`;
		}
		return "Metered usage";
	}

	if (price.unit_amount != null) {
		return formatStripeCurrency({ amount: price.unit_amount, currency });
	}

	return "—";
};

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
	const priceLabel = formatItemPrice({ price });
	const quantity = item.quantity ?? 1;
	const showQuantity = quantity > 1 && price?.billing_scheme !== "tiered";

	return (
		<div className="flex items-center justify-between text-xs gap-3">
			<span className="text-t2 truncate min-w-0">{productName}</span>
			<div className="shrink-0 ml-2 text-t3 text-right">
				{priceLabel}
				{showQuantity && <span className="text-t4"> × {quantity}</span>}
			</div>
		</div>
	);
};

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
	const isLinked = proposal.already_linked_product_id !== null;
	const matchedPlans = proposal.phases[0]?.plans ?? [];

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

			<span className="block text-xs font-mono text-t3 truncate">
				{proposal.stripe_subscription_id}
			</span>

			{sub && sub.items.data.length > 0 && (
				<div className="space-y-1.5">
					<span className="text-xs text-t3 font-medium">
						Subscription items
					</span>
					<div className="space-y-1">
						{sub.items.data.map((item) => (
							<StripeItemRow key={item.id} item={item} />
						))}
					</div>
				</div>
			)}

			{matchedPlans.length > 0 && (
				<div className="space-y-1.5">
					<span className="text-xs text-t3 font-medium">Matched Plans</span>
					<div className="space-y-1">
						{matchedPlans.map((plan, index) => {
							const name = productNamesById[plan.plan_id] ?? plan.plan_id;
							const quantity = plan.quantity ?? 1;
							return (
								<div
									key={`${plan.plan_id}-${index}`}
									className="flex items-center justify-between text-xs gap-3"
								>
									<span className="text-t2 truncate">{name}</span>
									{quantity > 1 && (
										<span className="text-t4 shrink-0 ml-2">× {quantity}</span>
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
	onSelect: (stripeSubscriptionId: string) => void;
}) {
	const { products } = useProductsQuery();
	const productNamesById = Object.fromEntries(
		(products ?? []).map((p) => [p.id, p.name]),
	);

	return (
		<div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
			{isLoading && (
				<div className="flex items-center justify-center py-12">
					<SmallSpinner size={20} className="text-t3" />
				</div>
			)}
			{Boolean(error) && (
				<div className="text-sm text-red-500 py-4">
					Failed to load Stripe subscriptions.
				</div>
			)}
			{!isLoading && !error && proposals.length === 0 && (
				<div className="text-sm text-t3 py-8 text-center">
					No Stripe subscriptions found for this customer.
				</div>
			)}
			{!isLoading &&
				proposals.map((proposal) => (
					<ProposalCard
						key={proposal.stripe_subscription_id}
						proposal={proposal}
						onSelect={() =>
							proposal.stripe_subscription_id &&
							onSelect(proposal.stripe_subscription_id)
						}
						productNamesById={productNamesById}
					/>
				))}
		</div>
	);
}
