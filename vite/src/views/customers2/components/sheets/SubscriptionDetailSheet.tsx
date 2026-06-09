import type { ApiDiscount } from "@autumn/shared";
import {
	CusProductStatus,
	cp,
	type Entity,
	type FrontendProduct,
	isCustomerProductTrialing,
	type ProductItem,
	sortPlanItems,
	splitBooleanItems,
	UsageModel,
} from "@autumn/shared";
import {
	ArrowSquareOutIcon,
	CalendarBlankIcon,
	CreditCardIcon,
	CubeIcon,
	GitBranchIcon,
	HashIcon,
	HeartbeatIcon,
	Info,
	SubtractIcon,
	TagIcon,
	TicketIcon,
	TimerIcon,
	XCircle,
} from "@phosphor-icons/react";
import { format } from "date-fns";
import { useMemo } from "react";
import { CollapsedBooleanItems } from "@/components/forms/shared/plan-items/CollapsedBooleanItems";
import { Button } from "@/components/v2/buttons/Button";
import { MiniCopyButton } from "@/components/v2/buttons/CopyButton";
import { IconButton } from "@/components/v2/buttons/IconButton";
import { InfoRow } from "@/components/v2/InfoRow";
import { SheetHeader, SheetSection } from "@/components/v2/sheets/InlineSheet";
import { useCusRewardsQuery } from "@/hooks/queries/useCusRewardsQuery";
import { useOrgStripeQuery } from "@/hooks/queries/useOrgStripeQuery";
import { useProductVersionQuery } from "@/hooks/queries/useProductVersionQuery";
import { usePrepaidItems } from "@/hooks/stores/useProductStore";
import { useSheetStore } from "@/hooks/stores/useSheetStore";
import { useSubscriptionById } from "@/hooks/stores/useSubscriptionStore";

import { backendToDisplayQuantity } from "@/utils/billing/prepaidQuantityUtils";
import { useEnv } from "@/utils/envUtils";
import { getStripeSubLink } from "@/utils/linkUtils";
import { useCusQuery } from "@/views/customers/customer/hooks/useCusQuery";
import { BasePriceDisplay } from "@/views/products/plan/components/plan-card/BasePriceDisplay";
import { PlanFeatureRow } from "@/views/products/plan/components/plan-card/PlanFeatureRow";
import { CustomerProductsStatus } from "../table/customer-products/CustomerProductsStatus";

function formatDiscountLabel({ discount }: { discount: ApiDiscount }): string {
	const value =
		discount.type === "percentage_discount"
			? `${discount.discount_value}% off`
			: `${discount.discount_value / 100} ${discount.currency?.toUpperCase() ?? ""} off`;

	return discount.name ? `${discount.name} (${value})` : value;
}

function SubscriptionDetailItems({
	items,
	product,
	prepaidDisplayQuantities,
	adminIds,
}: {
	items: ProductItem[];
	product: FrontendProduct;
	prepaidDisplayQuantities: Record<string, number>;
	adminIds?: import("@/components/forms/shared/admin/AdminPlanIdsTooltip").AdminPlanIds;
}) {
	const sortedItems = useMemo(() => sortPlanItems({ items }), [items]);
	const { visibleItems, collapsedBooleanItems } = useMemo(
		() => splitBooleanItems({ items: sortedItems }),
		[sortedItems],
	);

	const renderRow = (item: ProductItem, index: number) => {
		if (!item.feature_id) return null;
		const prepaidQuantity =
			item.usage_model === UsageModel.Prepaid
				? (prepaidDisplayQuantities[item.feature_id] ?? null)
				: null;

		return (
			<PlanFeatureRow
				key={`${index}-${item.feature_id ?? ""}-${item.price_id ?? ""}-${item.entitlement_id ?? ""}`}
				item={item}
				index={index}
				readOnly={true}
				prepaidQuantity={prepaidQuantity}
			/>
		);
	};

	return (
		<SheetSection>
			<div className="flex gap-2 justify-between items-center h-6 mb-1">
				<BasePriceDisplay
					product={product}
					readOnly={true}
					adminIds={adminIds}
				/>
			</div>

			<div className="flex flex-col gap-0">
				{visibleItems.map((item, index) => renderRow(item, index))}
				{collapsedBooleanItems.length > 0 && (
					<CollapsedBooleanItems
						items={collapsedBooleanItems}
						triggerClassName="pl-0 pr-1"
						renderItem={(item, index) =>
							renderRow(item, visibleItems.length + index)
						}
					/>
				)}
			</div>
		</SheetSection>
	);
}

export function SubscriptionDetailSheet() {
	const { customer, testClockFrozenTimeMs } = useCusQuery();
	const { stripeAccount } = useOrgStripeQuery();
	const env = useEnv();
	const itemId = useSheetStore((s) => s.itemId);
	const setSheet = useSheetStore((s) => s.setSheet);
	// Get customer product and productV2 by itemId
	const { cusProduct, productV2 } = useSubscriptionById({ itemId });
	const { getDiscountsForSubscription } = useCusRewardsQuery();

	// Prefetch product version data so the update sheet has it cached immediately
	useProductVersionQuery({ productId: productV2?.id });

	const nowMs = testClockFrozenTimeMs ?? Date.now();
	const isExpired = cusProduct?.status === CusProductStatus.Expired;
	const isCanceled = cusProduct?.canceled;
	const isOneOff = cp(cusProduct).oneOff().valid;

	// Check for prepaid items in the product (must be called before any returns)
	const { prepaidItems } = usePrepaidItems({ product: productV2 ?? undefined });

	if (!cusProduct) {
		return (
			<div className="flex flex-col h-full">
				<SheetHeader
					title="Subscription Details"
					description="Loading subscription information..."
				/>
			</div>
		);
	}

	const entity = customer?.entities?.find(
		(e: Entity) =>
			e.internal_id === cusProduct.internal_entity_id ||
			e.id === cusProduct.entity_id,
	);

	const isScheduled = cusProduct.status === CusProductStatus.Scheduled;
	const subscriptionDiscounts = getDiscountsForSubscription({
		subscriptionIds: cusProduct.subscription_ids ?? [],
	});

	const canCancel = !isExpired;
	const canUpdate = !isExpired && !isScheduled;
	const prepaidDisplayQuantities = backendToDisplayQuantity({
		backendOptions: cusProduct.options,
		prepaidItems,
	});

	const baseCustomerPrice = cusProduct.customer_prices?.find(
		(cp: { price: { config?: { stripe_price_id?: string } } }) =>
			Boolean(cp.price?.config?.stripe_price_id),
	);
	const adminIds = {
		stripe_price_id: baseCustomerPrice?.price?.config?.stripe_price_id ?? null,
		stripe_product_id: cusProduct.product?.processor?.id ?? null,
		internal_product_id: cusProduct.product?.internal_id ?? null,
	};

	const formatDate = (timestamp: number | null | undefined) => {
		if (!timestamp) return "—";
		return format(new Date(timestamp), "MMM d, yyyy, HH:mm");
	};

	const handleUpdateSubscription = () => {
		setSheet({ type: "subscription-update", itemId });
	};

	const handleViewStripe = () => {
		if (!cusProduct?.subscription_ids?.[0]) return;

		const subscriptionId = cusProduct.subscription_ids[0];
		if (stripeAccount) {
			window.open(
				getStripeSubLink({
					subscriptionId,
					env,
					accountId: stripeAccount.id,
				}),
				"_blank",
			);
		} else {
			window.open(
				getStripeSubLink({
					subscriptionId,
					env,
				}),
				"_blank",
			);
		}
	};

	return (
		<div className="flex flex-col h-full overflow-y-auto">
			<SheetHeader
				title={`${cusProduct.product.name ?? "Subscription Details"}`}
				description={`Subscription details for ${cusProduct.product.name}`}
			/>

			{productV2?.items && productV2.items.length > 0 && (
				<SubscriptionDetailItems
					items={productV2.items}
					product={productV2}
					prepaidDisplayQuantities={prepaidDisplayQuantities}
					adminIds={adminIds}
				/>
			)}

			<SheetSection withSeparator={true}>
				<div className="flex gap-2 justify-between overflow-hidden">
					<div className="space-y-3 min-w-0 overflow-hidden">
						<InfoRow
							icon={<CubeIcon size={16} weight="duotone" />}
							label="Plan"
							value={cusProduct.product.name}
						/>
						<InfoRow
							icon={<HashIcon size={16} />}
							label="ID"
							value={cusProduct.product_id}
							mono
						/>
						<InfoRow
							icon={<GitBranchIcon size={16} />}
							label="Version"
							value={cusProduct.product.version}
						/>
						{cusProduct.quantity && cusProduct.quantity > 1 && (
							<InfoRow
								icon={<Info size={16} weight="duotone" />}
								label="Quantity"
								value={cusProduct.quantity.toString()}
							/>
						)}
						{cusProduct.external_id && (
							<InfoRow
								icon={<TagIcon size={16} weight="duotone" />}
								label="Sub ID"
								value={cusProduct.external_id}
								mono
							/>
						)}
						{cusProduct.subscription_ids?.length > 0 && (
							<div className="flex items-center gap-2 min-w-0 overflow-hidden">
								<div className="text-subtle/60 shrink-0">
									<CreditCardIcon size={16} />
								</div>
								<div className="flex min-w-0 items-center overflow-hidden">
									<div className="text-tertiary-foreground text-sm font-medium w-20 shrink-0 whitespace-nowrap">
										Stripe ID
									</div>
									<div className="min-w-0 overflow-hidden">
										<MiniCopyButton
											text={cusProduct.subscription_ids[0]}
											innerClassName="text-sm text-foreground font-mono truncate"
										/>
									</div>
								</div>
								<IconButton
									variant="secondary"
									onClick={handleViewStripe}
									icon={<ArrowSquareOutIcon size={16} weight="duotone" />}
									className="shrink-0"
								>
									View Stripe
								</IconButton>
							</div>
						)}
					</div>
				</div>
			</SheetSection>

			{entity && (
				<SheetSection>
					<div className="space-y-3">
						<InfoRow
							icon={<SubtractIcon size={16} weight="duotone" />}
							label="Entity"
							value={entity.name || entity.id || entity.internal_id}
						/>
						<InfoRow
							icon={<HashIcon size={16} weight="duotone" />}
							label="Entity ID"
							value={entity.id || entity.internal_id}
							mono
						/>
					</div>
				</SheetSection>
			)}

			<SheetSection>
				<div className="space-y-3">
					<InfoRow
						icon={<HeartbeatIcon size={16} weight="duotone" />}
						label="Status"
						value={
							<CustomerProductsStatus
								status={cusProduct.status}
								canceled={cusProduct.canceled}
								canceled_at={cusProduct.canceled_at ?? undefined}
								trialing={
									isCustomerProductTrialing(cusProduct, {
										nowMs,
									}) || false
								}
								trial_ends_at={cusProduct.trial_ends_at ?? undefined}
								nowMs={nowMs}
							/>
						}
					/>

					{subscriptionDiscounts.map((discount: ApiDiscount) => (
						<InfoRow
							key={discount.id}
							icon={<TicketIcon size={16} weight="duotone" />}
							label="Coupon"
							value={formatDiscountLabel({ discount })}
						/>
					))}

					<InfoRow
						icon={<CalendarBlankIcon size={16} weight="duotone" />}
						label="Started"
						value={formatDate(cusProduct.starts_at)}
					/>

					{cusProduct.trial_ends_at && (
						<InfoRow
							icon={<TimerIcon size={16} weight="duotone" />}
							label="Trial Ends"
							value={formatDate(cusProduct.trial_ends_at)}
						/>
					)}

					{cusProduct.canceled_at && (
						<InfoRow
							icon={<XCircle size={16} weight="duotone" />}
							label="Canceled"
							value={formatDate(cusProduct.canceled_at)}
						/>
					)}

					{cusProduct.ended_at && (
						<InfoRow
							icon={<XCircle size={16} weight="duotone" />}
							label={isOneOff ? "Access Ends" : "Ended"}
							value={formatDate(cusProduct.ended_at)}
						/>
					)}
				</div>
			</SheetSection>

			{(canCancel || canUpdate) && (
				<div className="sticky bottom-0 p-4 flex gap-2 bg-card">
					{canCancel &&
						(isCanceled ? (
							<Button
								variant="secondary"
								className="flex-1"
								onClick={() =>
									setSheet({ type: "subscription-uncancel", itemId })
								}
							>
								Manage Cancellation
							</Button>
						) : (
							<Button
								variant="secondary"
								className="flex-1"
								onClick={() =>
									setSheet({ type: "subscription-cancel", itemId })
								}
							>
								{isScheduled ? "Cancel Scheduled Plan" : "Cancel Subscription"}
							</Button>
						))}
					{canUpdate && (
						<Button
							variant="primary"
							className="flex-1"
							onClick={handleUpdateSubscription}
						>
							Update Subscription
						</Button>
					)}
				</div>
			)}
		</div>
	);
}
