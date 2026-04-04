import type { AppEnv, FullCusProduct, ProductV2 } from "@autumn/shared";
import {
	ArrowSquareOutIcon,
	CheckCircleIcon,
	LinkIcon,
	PencilSimpleIcon,
	PlusIcon,
	TrashIcon,
	WarningCircleIcon,
} from "@phosphor-icons/react";
import { SearchableSelect } from "@/components/v2/selects/SearchableSelect";
import { cn } from "@/lib/utils";
import {
	getStripeConnectViewAsLink,
	getStripeSubLink,
} from "@/utils/linkUtils";
import type {
	SyncMapping,
	SyncProposal,
	SyncProposalItem,
} from "./syncStripeTypes";
import { hasActiveProductInGroup } from "./syncStripeUtils";

/** Formats a Stripe amount (in cents) as a currency string. */
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

/** Builds a human-readable price description for a proposal item. */
const formatItemPrice = ({ item }: { item: SyncProposalItem }): string => {
	const currency = item.currency ?? "usd";

	if (item.billing_scheme === "tiered") {
		const label =
			item.tiers_mode === "volume" ? "Volume pricing" : "Tiered pricing";
		if (!item.tiers || item.tiers.length === 0) return label;

		const tierDescriptions = item.tiers.map((tier) => {
			const upTo = tier.up_to === null ? "∞" : tier.up_to.toLocaleString();
			const parts: string[] = [];
			if (tier.unit_amount != null)
				parts.push(
					`${formatStripeCurrency({ amount: tier.unit_amount, currency })}/unit`,
				);
			if (tier.flat_amount != null)
				parts.push(
					`${formatStripeCurrency({ amount: tier.flat_amount, currency })} flat`,
				);
			return `≤${upTo}: ${parts.join(" + ") || "free"}`;
		});
		return `${label} — ${tierDescriptions.join(", ")}`;
	}

	if (item.recurring_usage_type === "metered") {
		if (item.unit_amount != null)
			return `${formatStripeCurrency({ amount: item.unit_amount, currency })}/unit (metered)`;
		return "Metered usage";
	}

	if (item.unit_amount != null)
		return formatStripeCurrency({ amount: item.unit_amount, currency });

	return "—";
};

export type StripeContext = {
	env: AppEnv;
	stripeAccountId: string | undefined;
	isAdmin: boolean;
	masterStripeAccountId: string | undefined;
};

export function SyncProposalCard({
	proposal,
	products,
	mappings,
	customerProducts,
	onMappingsChange,
	onEditItems,
	stripeContext,
}: {
	proposal: SyncProposal;
	products: ProductV2[];
	mappings: SyncMapping[];
	customerProducts: FullCusProduct[];
	onMappingsChange: (mappings: SyncMapping[]) => void;
	onEditItems: (mappingIndex: number) => void;
	stripeContext: StripeContext;
}) {
	const firstMatch = proposal.items.find((item) => item.matched_plan_id);
	const hasMatch = Boolean(firstMatch);
	const isEnabled = mappings.length > 0 && mappings.some((m) => m.enabled);

	const linkedProduct = proposal.already_linked_product_id
		? products.find((p) => p.id === proposal.already_linked_product_id)
		: null;

	const handleEnabledToggle = () => {
		if (isEnabled) {
			onMappingsChange(mappings.map((m) => ({ ...m, enabled: false })));
		} else if (mappings.length > 0) {
			onMappingsChange(mappings.map((m) => ({ ...m, enabled: true })));
		} else {
			onMappingsChange([
				{
					stripe_subscription_id: proposal.stripe_subscription_id,
					plan_id: firstMatch?.matched_plan_id ?? "",
					expire_previous: true,
					enabled: true,
					items: null,
				},
			]);
		}
	};

	const handleMappingPlanChange = ({
		index,
		planId,
	}: {
		index: number;
		planId: string;
	}) => {
		const updated = [...mappings];
		updated[index] = { ...updated[index], plan_id: planId, items: null };
		onMappingsChange(updated);
	};

	const anyHasActiveGroup = mappings.some(
		(m) =>
			m.plan_id &&
			hasActiveProductInGroup({
				planId: m.plan_id,
				products: products ?? [],
				customerProducts,
			}),
	);

	const expirePrevious = mappings.some((m) => m.expire_previous);

	const handleExpirePreviousToggle = () => {
		onMappingsChange(
			mappings.map((m) => ({ ...m, expire_previous: !expirePrevious })),
		);
	};

	const handleRemoveMapping = ({ index }: { index: number }) => {
		const updated = mappings.filter((_, i) => i !== index);
		onMappingsChange(updated);
	};

	const handleAddMapping = () => {
		onMappingsChange([
			...mappings,
			{
				stripe_subscription_id: proposal.stripe_subscription_id,
				plan_id: "",
				expire_previous: false,
				enabled: true,
				items: null,
			},
		]);
	};

	const handleOpenStripe = () => {
		const { env, stripeAccountId, isAdmin, masterStripeAccountId } =
			stripeContext;
		const subId = proposal.stripe_subscription_id;

		if (isAdmin && masterStripeAccountId && stripeAccountId) {
			window.open(
				getStripeConnectViewAsLink({
					masterAccountId: masterStripeAccountId,
					connectedAccountId: stripeAccountId,
					env,
					path: `subscriptions/${subId}`,
				}),
				"_blank",
			);
		} else {
			window.open(
				getStripeSubLink({
					subscriptionId: subId,
					env,
					accountId: stripeAccountId,
				}),
				"_blank",
			);
		}
	};

	return (
		<div
			className={cn(
				"border border-border rounded-lg p-4 space-y-3",
				!isEnabled && "opacity-50",
			)}
		>
			{/* Already linked warning */}
			{linkedProduct && (
				<div className="flex items-center gap-1.5 text-xs text-amber-600 bg-amber-500/10 px-2 py-1.5 rounded-md">
					<LinkIcon className="size-3.5 shrink-0" weight="bold" />
					Already linked to{" "}
					{linkedProduct.name ?? proposal.already_linked_product_id}
				</div>
			)}

			{/* Header with import toggle */}
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-2 min-w-0">
					{hasMatch ? (
						<CheckCircleIcon
							className="size-4 text-green-500 shrink-0"
							weight="fill"
						/>
					) : (
						<WarningCircleIcon
							className="size-4 text-amber-500 shrink-0"
							weight="fill"
						/>
					)}
					<span className="text-xs font-mono text-t3 truncate">
						{proposal.stripe_subscription_id}
					</span>
					<button
						type="button"
						onClick={handleOpenStripe}
						className="shrink-0 text-t4 hover:text-t2 transition-colors"
					>
						<ArrowSquareOutIcon className="size-3.5" />
					</button>
				</div>
				<button
					type="button"
					onClick={handleEnabledToggle}
					className={cn(
						"text-xs px-2 py-0.5 rounded-md shrink-0 font-medium transition-colors cursor-pointer",
						isEnabled
							? "bg-primary/10 text-primary border border-primary/30 hover:bg-primary/20"
							: "bg-muted text-t4 border border-border hover:text-t2 hover:border-primary/30",
					)}
				>
					Import
				</button>
			</div>

			{/* Stripe prices */}
			<div className="space-y-1.5">
				<span className="text-xs text-t3 font-medium">
					Subscription items
				</span>
				{proposal.items.map((item) => {
					const displayName = item.stripe_product_name ?? item.stripe_price_id;
					const priceLabel = formatItemPrice({ item });
					const showQuantity =
						item.quantity != null &&
						item.quantity > 1 &&
						item.billing_scheme !== "tiered";

					return (
						<div
							key={item.stripe_price_id}
							className="flex items-center justify-between text-xs"
						>
							<span
								className={cn(
									"text-t2",
									!item.stripe_product_name && "font-mono text-t3",
								)}
							>
								{displayName}
							</span>
							<span className="text-t3 shrink-0 ml-3 text-right">
								{priceLabel}
								{showQuantity && (
									<span className="text-t4 ml-1">×{item.quantity}</span>
								)}
							</span>
						</div>
					);
				})}
			</div>

			{/* Plan mappings */}
			{isEnabled && (
				<div className="space-y-3.5">
					<span className="text-xs text-t3 font-medium">Autumn plans</span>
					<div className="space-y-1.5">
						{mappings.map((mapping, index) => (
							<SyncMappingRow
								key={`${mapping.stripe_subscription_id}-${index}`}
								mapping={mapping}
								index={index}
								products={products}
								showRemove={mappings.length > 1}
								onPlanChange={handleMappingPlanChange}
								onRemove={handleRemoveMapping}
								onEditItems={onEditItems}
							/>
						))}
						<button
							type="button"
							onClick={handleAddMapping}
							className="flex items-center gap-1 text-xs text-t3 hover:text-t1 transition-colors"
						>
							<PlusIcon className="size-3" />
							Add another plan
						</button>
					</div>
					{anyHasActiveGroup && (
						<button
							type="button"
							onClick={handleExpirePreviousToggle}
							className={cn(
								"text-xs px-2 py-0.5 rounded-md font-medium transition-colors cursor-pointer w-fit",
								expirePrevious
									? "bg-amber-500/10 text-amber-600 border border-amber-500/30 hover:bg-amber-500/20"
									: "bg-muted text-t4 border border-border hover:text-t2 hover:border-amber-500/30",
							)}
						>
							Expire current plans in same group
						</button>
					)}
				</div>
			)}
		</div>
	);
}

function SyncMappingRow({
	mapping,
	index,
	products,
	showRemove,
	onPlanChange,
	onRemove,
	onEditItems,
}: {
	mapping: SyncMapping;
	index: number;
	products: ProductV2[];
	showRemove: boolean;
	onPlanChange: (params: { index: number; planId: string }) => void;
	onRemove: (params: { index: number }) => void;
	onEditItems: (mappingIndex: number) => void;
}) {
	const hasCustomItems = mapping.items !== null && mapping.items.length > 0;

	return (
		<div className="flex items-center gap-1.5">
			<SearchableSelect
				value={mapping.plan_id || null}
				onValueChange={(planId) => onPlanChange({ index, planId })}
				options={products}
				getOptionValue={(product) => product.id}
				getOptionLabel={(product) => product.name}
				placeholder="Select a plan..."
				searchable
				searchPlaceholder="Search plans..."
				triggerClassName={cn(
					"flex-1",
					hasCustomItems && "ring-1 ring-blue-500/50",
				)}
			/>

			{mapping.plan_id && (
				<button
					type="button"
					onClick={() => onEditItems(index)}
					className={cn(
						"shrink-0 p-1.5 rounded-md transition-colors",
						hasCustomItems
							? "text-blue-500 bg-blue-500/10 hover:bg-blue-500/20"
							: "text-t4 hover:text-t2 hover:bg-sidebar",
					)}
					title="Customize plan items"
				>
					<PencilSimpleIcon className="size-3.5" />
				</button>
			)}

			{showRemove && (
				<button
					type="button"
					onClick={() => onRemove({ index })}
					className="shrink-0 p-1.5 text-t4 hover:text-red-500 rounded-md hover:bg-red-500/10 transition-colors"
					title="Remove this plan"
				>
					<TrashIcon className="size-3.5" />
				</button>
			)}
		</div>
	);
}
