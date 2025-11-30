import {
	CusProductStatus,
	type Entity,
	featureToOptions,
	isTrialing,
	UsageModel,
} from "@autumn/shared";
import {
	ArrowSquareOutIcon,
	CalendarBlankIcon,
	CubeIcon,
	GitBranchIcon,
	HashIcon,
	HeartbeatIcon,
	Info,
	PencilSimpleIcon,
	ShoppingBagIcon,
	SubtractIcon,
	TimerIcon,
	XCircle,
} from "@phosphor-icons/react";
import { format } from "date-fns";
import { useEffect } from "react";
import { useNavigate } from "react-router";
// import { Badge } from "@/components/v2/Badge";
import { IconButton } from "@/components/v2/buttons/IconButton";
import { InfoRow } from "@/components/v2/InfoRow";
import { SheetHeader, SheetSection } from "@/components/v2/sheets/InlineSheet";
import { useOrgStripeQuery } from "@/hooks/queries/useOrgStripeQuery";
import {
	usePrepaidItems,
	useProductStore,
} from "@/hooks/stores/useProductStore";
import { useSheetStore } from "@/hooks/stores/useSheetStore";
import { useSubscriptionById } from "@/hooks/stores/useSubscriptionStore";
import { useEnv } from "@/utils/envUtils";
import { pushPage } from "@/utils/genUtils";
import { getStripeSubLink } from "@/utils/linkUtils";
import { useCusQuery } from "@/views/customers/customer/hooks/useCusQuery";
import { BasePriceDisplay } from "@/views/products/plan/components/plan-card/BasePriceDisplay";
import { PlanFeatureRow } from "@/views/products/plan/components/plan-card/PlanFeatureRow";
import { useFeaturesQuery } from "../../../../hooks/queries/useFeaturesQuery";
import { CustomerProductsStatus } from "../table/customer-products/CustomerProductsStatus";
import { UpdatePlanButton } from "./UpdatePlanButton";

export function SubscriptionDetailSheet() {
	const { customer } = useCusQuery();
	const { stripeAccount } = useOrgStripeQuery();
	const { features } = useFeaturesQuery();
	const env = useEnv();
	const itemId = useSheetStore((s) => s.itemId);
	const setSheet = useSheetStore((s) => s.setSheet);
	const navigate = useNavigate();
	const resetProductStore = useProductStore((s) => s.reset);
	const sheetType = useSheetStore((s) => s.type);
	// Get edited product from store

	const storeProduct = useProductStore((s) => s.product);

	// Check if there are changes in the product store
	const showUpdateProduct = storeProduct?.id;

	// Get customer product and productV2 by itemId
	const { cusProduct, productV2 } = useSubscriptionById({ itemId });
	const isExpired = cusProduct?.status === CusProductStatus.Expired;

	useEffect(() => {
		if (
			sheetType !== "subscription-detail" &&
			sheetType !== "subscription-update"
		) {
			resetProductStore();
		}
	}, [sheetType, resetProductStore]);

	// Check for prepaid items in the product (must be called before any returns)
	const { prepaidItems } = usePrepaidItems({ product: productV2 ?? undefined });
	const hasPrepaidItems = prepaidItems.length > 0;

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

	const formatDate = (timestamp: number | null | undefined) => {
		if (!timestamp) return "—";
		return format(new Date(timestamp), "MMM d, yyyy, HH:mm");
	};

	const handleEditPlan = () => {
		if (!cusProduct || !customer) return;

		const entity = customer.entities?.find(
			(e: Entity) =>
				e.internal_id === cusProduct.internal_entity_id ||
				e.id === cusProduct.entity_id,
		);

		pushPage({
			path: `/customers/${customer.id || customer.internal_id}/${cusProduct.product_id}`,
			queryParams: {
				id: cusProduct.id,
				entity_id: entity ? entity.id || entity.internal_id : undefined,
				version: cusProduct.product.version,
			},
			navigate,
		});
		// closeSheet();
	};

	const handleUpdateQuantities = () => {
		// Open the subscription update sheet
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
		<div className="flex flex-col h-full">
			<SheetHeader
				title={`${cusProduct.product.name ?? "Subscription Details"}`}
				description={`Subscription details for ${cusProduct.product.name}`}
			/>

			{/* Plan Items */}
			{productV2?.items && productV2.items.length > 0 && (
				<SheetSection>
					{productV2 && (
						<div className="flex gap-2 justify-between items-center h-6 mb-3">
							<div className="">
								<BasePriceDisplay product={productV2} readOnly={true} />
							</div>
							<div className="flex gap-2">
								{hasPrepaidItems && !isExpired && !isScheduled && (
									<IconButton
										variant="secondary"
										onClick={handleUpdateQuantities}
										icon={<ShoppingBagIcon size={16} weight="duotone" />}
									>
										Update Quantities
									</IconButton>
								)}
								{!isExpired && !isScheduled && (
									<IconButton
										variant="primary"
										onClick={handleEditPlan}
										icon={<PencilSimpleIcon size={16} weight="duotone" />}
									>
										Edit Plan
									</IconButton>
								)}
							</div>
						</div>
					)}

					<div className="space-y-2">
						{productV2.items.map((item, index) => {
							if (!item.feature_id) return null;

							const feature = features.find((f) => f.id === item.feature_id);
							const prepaidOption = featureToOptions({
								feature,
								options: cusProduct.options,
							});

							// const prepaidQuantity = prepaidOption ? prepaidOption.quantity / (item.billing_units || 1) : null;
							const prepaidQuantity =
								item.usage_model === UsageModel.Prepaid
									? prepaidOption?.quantity
									: null;

							// // Find prepaid quantity from cusProduct.options
							// const prepaidOption = cusProduct?.options?.find(
							// 	(opt: FeatureOptions) => opt.feature_id === item.feature_id,
							// );
							// const prepaidQuantity = prepaidOption
							// 	? prepaidOption.quantity / (item.billing_units || 1)
							// 	: null;

							return (
								<PlanFeatureRow
									key={item.feature_id || item.price_id || index}
									item={item}
									index={index}
									readOnly={true}
									prepaidQuantity={prepaidQuantity}
								/>
							);
						})}
					</div>
				</SheetSection>
			)}

			<div className="flex-1 overflow-y-auto">
				{/* Product Information */}
				<SheetSection
					// title="Plan"
					withSeparator={true}
				>
					<div className="flex gap-2 justify-between">
						<div className="space-y-3">
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
						</div>
						{/* {!isExpired && (
							<IconButton
								variant="primary"
								onClick={handleEditPlan}
								icon={<PencilSimpleIcon size={16} weight="duotone" />}
							>
								Edit Plan
							</IconButton>
						)} */}
					</div>
				</SheetSection>
				{/* Entity Information */}
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
				{/* Status & Dates */}
				<SheetSection>
					<div className="flex gap-2 justify-between">
						<div className="space-y-3">
							<InfoRow
								icon={<HeartbeatIcon size={16} weight="duotone" />}
								label="Status"
								value={
									<CustomerProductsStatus
										status={cusProduct.status}
										canceled={cusProduct.canceled}
										trialing={
											isTrialing({ cusProduct, now: Date.now() }) || false
										}
										trial_ends_at={cusProduct.trial_ends_at ?? undefined}
									/>
								}
							/>

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
									label="Ended"
									value={formatDate(cusProduct.ended_at)}
								/>
							)}
						</div>
						{cusProduct.subscription_ids?.length > 0 && (
							<IconButton
								variant="secondary"
								onClick={handleViewStripe}
								icon={<ArrowSquareOutIcon size={16} weight="duotone" />}
							>
								View Stripe
							</IconButton>
						)}
					</div>
				</SheetSection>{" "}
				{showUpdateProduct && (
					<div className="flex justify-end p-2">
						<UpdatePlanButton cusProduct={cusProduct} />{" "}
					</div>
				)}
			</div>
		</div>
	);
}
