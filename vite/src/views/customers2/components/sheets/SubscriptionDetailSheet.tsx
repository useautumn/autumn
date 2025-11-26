import {
	type Entity,
	type FeatureOptions,
	getProductItemDisplay,
	ProductItemType,
} from "@autumn/shared";
import {
	Calendar,
	CheckCircle,
	CreditCard,
	Hash,
	Info,
	Package,
	PencilSimple,
	Tag,
	XCircle,
} from "@phosphor-icons/react";
import { format } from "date-fns";
import { useNavigate } from "react-router";
// import { Badge } from "@/components/v2/Badge";
import { Button } from "@/components/v2/buttons/Button";
import { SheetHeader, SheetSection } from "@/components/v2/sheets/InlineSheet";
import { SheetFooter } from "@/components/v2/sheets/SharedSheetComponents";
import { useOrg } from "@/hooks/common/useOrg";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import { usePrepaidItems } from "@/hooks/stores/useProductStore";
import { useSheetStore } from "@/hooks/stores/useSheetStore";
import {
	useAttachProductStore,
	useSubscriptionById,
} from "@/hooks/stores/useSubscriptionStore";
import { cn } from "@/lib/utils";
import { pushPage } from "@/utils/genUtils";
import { useCusQuery } from "@/views/customers/customer/hooks/useCusQuery";
import { CustomerProductPrice } from "../table/customer-products/CustomerProductPrice";
import { UpdatePlanButton } from "./UpdatePlanButton";

export function SubscriptionDetailSheet() {
	const { customer } = useCusQuery();
	const { org } = useOrg();
	const { features } = useFeaturesQuery();
	const itemId = useSheetStore((s) => s.itemId);
	const setSheet = useSheetStore((s) => s.setSheet);
	const navigate = useNavigate();

	// Get edited product from store
	const customizedProduct = useAttachProductStore((s) => s.customizedProduct);
	const editedCustomerProductId = useAttachProductStore(
		(s) => s.customerProductId,
	);

	// Check if the edited product is for this subscription
	const shouldShowEditedProduct =
		customizedProduct && editedCustomerProductId === itemId;

	// Get customer product and productV2 by itemId
	const { cusProduct, productV2 } = useSubscriptionById({ itemId });

	// Check for prepaid items in the product (must be called before any returns)
	const prepaidItems = usePrepaidItems({ product: productV2 ?? undefined });
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

	const formatDate = (timestamp: number | null | undefined) => {
		if (!timestamp) return "—";
		return format(new Date(timestamp), "MMM d, yyyy 'at' h:mm a");
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

	return (
		<div className="flex flex-col h-full">
			<SheetHeader
				title="Subscription Details"
				description={`Details for ${cusProduct.product.name}`}
			/>

			<div className="flex-1 overflow-y-auto">
				{/* Product Information */}
				<SheetSection title="Product" withSeparator={false}>
					<div className="space-y-3">
						<InfoRow
							icon={<Package size={16} weight="duotone" />}
							label="Product Name"
							value={cusProduct.product.name}
						/>
						<InfoRow
							icon={<Tag size={16} weight="duotone" />}
							label="Product ID"
							value={cusProduct.product_id}
							mono
						/>
						<InfoRow
							icon={<Info size={16} weight="duotone" />}
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
				</SheetSection>

				{/* Status & Dates */}
				<SheetSection title="Status & Timeline">
					<div className="space-y-3">
						<InfoRow
							icon={<Info size={16} weight="duotone" />}
							label="Status"
							value={cusProduct.status}
							className="capitalize"
						/>

						<InfoRow
							icon={<Calendar size={16} weight="duotone" />}
							label="Started"
							value={formatDate(cusProduct.starts_at)}
						/>

						{cusProduct.trial_ends_at && (
							<InfoRow
								icon={<Calendar size={16} weight="duotone" />}
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
				</SheetSection>

				{/* Plan Items */}
				{productV2?.items && productV2.items.length > 0 && (
					<SheetSection title="Plan Items">
						<div className="space-y-2">
							{productV2.items.map((item, index) => {
								const display = getProductItemDisplay({
									item,
									features,
									currency: org?.default_currency || "USD",
									fullDisplay: true,
									amountFormatOptions: { currencyDisplay: "narrowSymbol" },
								});

								const isFeatureItem =
									item.type === ProductItemType.Feature ||
									item.type === ProductItemType.FeaturePrice;

								// Find prepaid quantity from cusProduct.options
								const prepaidOption = cusProduct?.options?.find(
									(opt: FeatureOptions) => opt.feature_id === item.feature_id,
								);
								const prepaidQuantity = prepaidOption
									? prepaidOption.quantity / (item.billing_units || 1)
									: null;

								return (
									<div
										key={item.feature_id || item.price_id || index}
										className="flex items-start gap-2 p-2 rounded-lg bg-muted/50"
									>
										<CheckCircle
											size={16}
											weight="fill"
											className={cn(
												"text-green-600 mt-0.5 shrink-0",
												!isFeatureItem && "opacity-0",
											)}
										/>
										<div className="flex-1 min-w-0">
											<div className="text-sm font-medium text-t1 flex items-center gap-2 flex-wrap">
												<span>{display.primary_text}</span>
												{prepaidQuantity !== null && (
													<span className="text-t3 bg-background/50 rounded-sm px-2 py-0.5 text-xs font-normal">
														Qty: {prepaidQuantity}
													</span>
												)}
											</div>
											{display.secondary_text && (
												<div className="text-xs text-t3 mt-0.5">
													{display.secondary_text}
												</div>
											)}
										</div>
									</div>
								);
							})}
						</div>
					</SheetSection>
				)}

				{/* Edited Plan Items - Show pending changes */}
				{shouldShowEditedProduct && customizedProduct.items.length > 0 && (
					<SheetSection title="Edited Plan Items (Pending)">
						<div className="space-y-2">
							<div className="flex items-center gap-2 mb-2 p-2 rounded-lg bg-blue-500/10 border border-blue-500/20">
								<Info size={16} weight="duotone" className="text-blue-600" />
								<span className="text-xs text-t2">
									These changes are pending and will be applied when you save.
								</span>
							</div>
							{customizedProduct.items.map((item, index) => {
								const display = getProductItemDisplay({
									item,
									features,
									currency: org?.default_currency || "USD",
									fullDisplay: true,
									amountFormatOptions: { currencyDisplay: "narrowSymbol" },
								});

								const isFeatureItem =
									item.type === ProductItemType.Feature ||
									item.type === ProductItemType.FeaturePrice;

								// Find prepaid quantity from cusProduct.options
								const prepaidOption = cusProduct?.options?.find(
									(opt: FeatureOptions) => opt.feature_id === item.feature_id,
								);
								const prepaidQuantity = prepaidOption
									? prepaidOption.quantity / (item.billing_units || 1)
									: null;

								return (
									<div
										key={item.feature_id || item.price_id || index}
										className="flex items-start gap-2 p-2 rounded-lg bg-blue-500/5 border border-blue-500/20"
									>
										<CheckCircle
											size={16}
											weight="fill"
											className={cn(
												"text-blue-600 mt-0.5 shrink-0",
												!isFeatureItem && "opacity-0",
											)}
										/>
										<div className="flex-1 min-w-0">
											<div className="text-sm font-medium text-t1 flex items-center gap-2 flex-wrap">
												<span>{display.primary_text}</span>
												{prepaidQuantity !== null && (
													<span className="text-t3 bg-background/50 rounded-sm px-2 py-0.5 text-xs font-normal">
														Qty: {prepaidQuantity}
													</span>
												)}
											</div>
											{display.secondary_text && (
												<div className="text-xs text-t3 mt-0.5">
													{display.secondary_text}
												</div>
											)}
										</div>
									</div>
								);
							})}
						</div>
					</SheetSection>
				)}

				{/* Pricing Summary */}
				<SheetSection title="Pricing">
					<CustomerProductPrice cusProduct={cusProduct} />
				</SheetSection>

				{/* Entity Information */}
				{entity && (
					<SheetSection title="Entity">
						<div className="space-y-3">
							<InfoRow
								icon={<Info size={16} weight="duotone" />}
								label="Entity Name"
								value={entity.name || entity.id || entity.internal_id}
							/>
							<InfoRow
								icon={<Tag size={16} weight="duotone" />}
								label="Entity ID"
								value={entity.id || entity.internal_id}
								mono
							/>
						</div>
					</SheetSection>
				)}

				{/* Billing Details */}
				<SheetSection title="Billing">
					<div className="space-y-3">
						<InfoRow
							icon={<CreditCard size={16} weight="duotone" />}
							label="Collection Method"
							value={cusProduct.collection_method}
							className="capitalize"
						/>
						{cusProduct.processor?.type && (
							<InfoRow
								icon={<Info size={16} weight="duotone" />}
								label="Processor"
								value={cusProduct.processor.type}
								className="capitalize"
							/>
						)}
					</div>
				</SheetSection>

				{/* Free Trial Info */}
				{cusProduct.free_trial && (
					<SheetSection title="Free Trial">
						<div className="space-y-3">
							<InfoRow
								icon={<Info size={16} weight="duotone" />}
								label="Trial Name"
								value={cusProduct.free_trial.name}
							/>
							{cusProduct.free_trial.trial_days && (
								<InfoRow
									icon={<Calendar size={16} weight="duotone" />}
									label="Trial Duration"
									value={`${cusProduct.free_trial.trial_days} days`}
								/>
							)}
						</div>
					</SheetSection>
				)}
			</div>

			<SheetFooter>
				{shouldShowEditedProduct ? (
					<>
						<Button variant="secondary" onClick={handleEditPlan}>
							<PencilSimple size={16} weight="duotone" />
							Edit Plan
						</Button>
						<UpdatePlanButton
							cusProduct={cusProduct}
							customizedProduct={customizedProduct}
						/>
					</>
				) : (
					<>
						<Button
							variant="primary"
							onClick={handleEditPlan}
							className={hasPrepaidItems ? "" : "col-span-2"}
						>
							<PencilSimple size={16} weight="duotone" />
							Edit Plan
						</Button>
						{hasPrepaidItems && (
							<Button variant="secondary" onClick={handleUpdateQuantities}>
								<Hash size={16} weight="duotone" />
								Update Quantities
							</Button>
						)}
					</>
				)}
			</SheetFooter>
		</div>
	);
}

interface InfoRowProps {
	icon: React.ReactNode;
	label: string;
	value: string | number;
	className?: string;
	mono?: boolean;
}

function InfoRow({ icon, label, value, className, mono }: InfoRowProps) {
	return (
		<div className="flex items-start gap-3">
			<div className="text-subtle mt-0.5">{icon}</div>
			<div className="flex-1 min-w-0">
				<div className="text-t3 text-sm font-medium mb-0.5">{label}</div>
				<div
					className={cn(
						"text-t1 text-sm wrap-break-word",
						mono && "font-mono text-xs",
						className,
					)}
				>
					{value}
				</div>
			</div>
		</div>
	);
}
