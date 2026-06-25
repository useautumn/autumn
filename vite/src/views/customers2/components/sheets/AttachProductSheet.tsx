import type { FullCustomer } from "@autumn/shared";
import { Button, Skeleton } from "@autumn/ui";
import { PlusIcon } from "@phosphor-icons/react";
import { useStore } from "@tanstack/react-form";
import type { AxiosError } from "axios";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
	AttachAdvancedSection,
	AttachFormProvider,
	AttachPlanOptions,
	AttachPlanSection,
	AttachProductSelection,
	AttachUpdatesSection,
	useAttachFormContext,
} from "@/components/forms/attach-v2";
import { AttachFooterV3 } from "@/components/forms/attach-v2/components/AttachFooterV3";
import {
	buildAttachPreviewTotals,
	getAttachPreviewLineItems,
	isFutureStartDate,
} from "@/components/forms/attach-v2/utils/buildAttachPreviewTotals";
import {
	GenerateCheckoutStageWithPreview,
	SchedulePlanStageWithPreview,
} from "@/components/forms/shared/GenerateCheckoutStage";
import { SendInvoiceStageWithPreview } from "@/components/forms/shared/SendInvoiceStage";
import { PreviewErrorDisplay } from "@/components/forms/update-subscription-v2/components/PreviewErrorDisplay";
import {
	STAGGER_CONTAINER,
	STAGGER_ITEM,
} from "@/components/forms/update-subscription-v2/constants/animationConstants";
import { InlinePlanEditor } from "@/components/v2/inline-custom-plan-editor/InlinePlanEditor";
import { LineItemsPreview } from "@/components/v2/LineItemsPreview";
import { PreviewTotalsBlock } from "@/components/v2/preview-totals/PreviewTotalsBlock";
import {
	LayoutGroup,
	SheetFooter,
	SheetHeader,
	SheetSection,
} from "@/components/v2/sheets/SharedSheetComponents";
import { useOrgStripeQuery } from "@/hooks/queries/useOrgStripeQuery";
import { useSheetStore } from "@/hooks/stores/useSheetStore";
import { useSheetScopeEntityId } from "@/hooks/useSheetScopeEntityId";
import { useEnv } from "@/utils/envUtils";
import { getBackendErr } from "@/utils/genUtils";
import { useCusQuery } from "@/views/customers/customer/hooks/useCusQuery";
import { useCustomerContext } from "@/views/customers2/customer/CustomerContext";
import { CreateEntity } from "@/views/customers2/customer/components/CreateEntity";
import { useScopeEntitySearch } from "@/views/customers2/customer/hooks/useScopeEntitySearch";
import { InfoBox } from "@/views/onboarding2/integrate/components/InfoBox";
import { EntityScopeSelector } from "./EntityScopeSelector";

function ReviewPreviewSkeleton() {
	return (
		<>
			{/* InfoBox skeleton — matches InfoBox(px-4 py-2) + leading-6 content */}
			<SheetSection withSeparator={false} className="pb-0">
				<div className="px-4 py-2 rounded-lg bg-accent/50">
					<div className="flex items-center gap-2 h-6">
						<Skeleton className="size-4 rounded-sm shrink-0" />
						<Skeleton className="h-3.5 w-56 rounded-sm" />
					</div>
				</div>
			</SheetSection>

			{/* Line items skeleton — matches accordion trigger(py-1 + text-sm) + totals(space-y-1) */}
			<SheetSection withSeparator={false}>
				<div className="flex flex-col gap-2">
					<div className="h-6 mb-2 flex items-center">
						<Skeleton className="h-3.5 w-28 rounded-sm" />
					</div>
					<div className="flex items-center justify-between py-1 min-h-7">
						<Skeleton className="h-3.5 w-20 rounded-sm" />
						<Skeleton className="h-3.5 w-3.5 rounded-sm" />
					</div>
					<div className="space-y-1">
						<div className="flex items-center justify-between min-h-5">
							<Skeleton className="h-3.5 w-24 rounded-sm" />
							<Skeleton className="h-3.5 w-16 rounded-sm" />
						</div>
						<div className="flex items-center justify-between min-h-5">
							<span className="flex items-center gap-2">
								<Skeleton className="h-3.5 w-20 rounded-sm" />
								<Skeleton className="h-4.5 w-16 rounded-full" />
							</span>
							<Skeleton className="h-3.5 w-16 rounded-sm" />
						</div>
					</div>
				</div>
			</SheetSection>

			{/* Footer skeleton — matches SheetFooter + h-9 buttons */}
			<SheetFooter className="flex flex-col grid-cols-1 mt-0">
				<div className="flex flex-col gap-2 w-full">
					<Skeleton className="h-9 w-full rounded-lg" />
					<Skeleton className="h-9 w-full rounded-lg" />
				</div>
			</SheetFooter>
		</>
	);
}

function ReviewPreviewBlock() {
	const { previewQuery, formValues, customerId } = useAttachFormContext();
	const hasProductSelected = !!formValues.productId;
	const {
		data: previewData,
		error: queryError,
		isLoading: previewLoading,
	} = previewQuery;

	const showSkeleton = previewLoading || (!previewData && !queryError);
	const hasShownSkeleton = useRef(false);
	if (showSkeleton) hasShownSkeleton.current = true;
	const animateIn = hasShownSkeleton.current && !showSkeleton;

	// Surface "tax couldn't be computed" once per resolved preview as a
	// non-blocking warning. We don't render the Tax row in that case — see
	// the totals section below.
	const incompleteToastShownFor = useRef<string | null>(null);
	useEffect(() => {
		if (!previewData?.tax) return;
		if (previewData.tax.status !== "incomplete") return;
		// Dedupe per request: keyed by the customer + plan in scope so flips
		// on the same form don't spam.
		const key = `${customerId ?? ""}|${formValues.productId ?? ""}`;
		if (incompleteToastShownFor.current === key) return;
		incompleteToastShownFor.current = key;
		toast.warning(
			"While preparing a tax preview for this purchase, we were unable to determine the customer's location. Tax will not be shown in this preview, but Stripe will compute it on the actual charge.",
		);
	}, [previewData?.tax, customerId, formValues.productId]);

	if (!hasProductSelected) return null;

	const error = queryError
		? getBackendErr(queryError as AxiosError, "Failed to load preview")
		: undefined;

	const previewTotals = buildAttachPreviewTotals({
		previewData,
		startDate: formValues.startDate,
	});
	const previewLineItems = getAttachPreviewLineItems({
		previewData,
		startDate: formValues.startDate,
	});
	const lineItemTotals = previewData
		? previewTotals.filter((total) => total.variant !== "primary")
		: previewTotals;

	return (
		<AnimatePresence mode="popLayout">
			{showSkeleton ? (
				<motion.div
					key="review-skeleton"
					initial={{ opacity: 0 }}
					animate={{ opacity: 1 }}
					exit={{ opacity: 0 }}
					transition={{ duration: 0.4, ease: "easeOut" }}
				>
					<ReviewPreviewSkeleton />
				</motion.div>
			) : (
				<motion.div
					key="review-content"
					initial={animateIn ? { opacity: 0, y: -6 } : false}
					animate={{ opacity: 1, y: 0 }}
					transition={{ duration: 0.3, ease: [0.25, 0.1, 0.25, 1] }}
				>
					<AttachUpdatesSection />
					{error ? (
						<SheetSection title="Pricing Preview" withSeparator>
							<PreviewErrorDisplay error={error} />
						</SheetSection>
					) : (
						<>
							<LineItemsPreview
								title="Pricing Preview"
								lineItems={previewLineItems}
								currency={previewData?.currency}
								totals={lineItemTotals}
								filterZeroAmounts
							/>
							{previewData && (
								<SheetSection withSeparator={false}>
									<PreviewTotalsBlock previewData={previewData} />
								</SheetSection>
							)}
						</>
					)}
					<AttachFooterV3 />
				</motion.div>
			)}
		</AnimatePresence>
	);
}

function PlanDiffSkeleton() {
	return (
		<SheetSection withSeparator>
			<div className="flex flex-col gap-1">
				<Skeleton className="h-4 w-32 rounded-sm" />
				<div className="flex flex-col gap-2 mt-1">
					{[1, 2, 3].map((i) => (
						<div
							key={i}
							className="flex items-center h-10 px-3 rounded-xl input-base gap-2"
						>
							<div className="flex items-center gap-1 shrink-0">
								<Skeleton className="size-4 rounded-sm" />
								<Skeleton className="size-1 rounded-full" />
								<Skeleton className="size-4 rounded-sm" />
							</div>
							<Skeleton className="h-3.5 w-36 rounded-sm" />
						</div>
					))}
				</div>
			</div>
		</SheetSection>
	);
}

function SelectContent() {
	const { formValues, entityId, onScopeChange } = useAttachFormContext();
	const { closeSheet, setSheet } = useSheetStore();
	const itemId = useSheetStore((s) => s.itemId);
	const hasProductSelected = !!formValues.productId;

	const {
		hasEntities,
		entities,
		selectedEntity: fullEntity,
		isLoading: isEntitiesLoading,
		setSearch: setEntitySearch,
	} = useScopeEntitySearch({ selectedEntityId: entityId ?? undefined });

	const [createEntityOpen, setCreateEntityOpen] = useState(false);

	return (
		<>
			<SheetHeader
				title="Attach Product"
				description="Select and configure a product to attach to this customer"
			/>

			<SheetSection withSeparator={false} className="pb-0">
				<div className="space-y-2">
					<AttachProductSelection />

					{hasEntities && (
						<EntityScopeSelector
							entities={entities}
							scopeEntityId={entityId ?? undefined}
							onScopeChange={(value) => onScopeChange?.(value)}
							onSearchChange={setEntitySearch}
							isLoading={isEntitiesLoading}
							wrapInSection={false}
							footer={
								<div className="border-t py-1.5 px-2">
									<Button
										variant="muted"
										className="w-full"
										onClick={() => setCreateEntityOpen(true)}
									>
										<PlusIcon
											className="size-[14px] text-muted-foreground"
											weight="regular"
										/>
										Create new entity
									</Button>
								</div>
							}
						/>
					)}

					{entityId ? (
						<div className="pt-2">
							<InfoBox variant="note">
								Attaching plan to entity{" "}
								<span className="font-semibold">
									{fullEntity?.name || fullEntity?.id}
								</span>
							</InfoBox>
						</div>
					) : hasEntities ? (
						<div className="pt-2">
							<InfoBox variant="note">
								Attaching plan to customer - all entities will get access
							</InfoBox>
						</div>
					) : null}
				</div>
			</SheetSection>

			{hasProductSelected && (
				<motion.div
					initial="hidden"
					animate="visible"
					variants={STAGGER_CONTAINER}
					className="flex flex-col"
				>
					<motion.div variants={STAGGER_ITEM}>
						<AttachPlanSection />
					</motion.div>
					<motion.div variants={STAGGER_ITEM}>
						<SheetSection withSeparator>
							<AttachPlanOptions />
						</SheetSection>
					</motion.div>
					<motion.div variants={STAGGER_ITEM}>
						<SheetFooter>
							<Button
								variant="secondary"
								onClick={closeSheet}
								className="w-full"
							>
								Cancel
							</Button>
							<Button
								variant="primary"
								onClick={() => setSheet({ type: "attach-review", itemId })}
								className="w-full"
							>
								Preview Changes
							</Button>
						</SheetFooter>
					</motion.div>
				</motion.div>
			)}

			<CreateEntity open={createEntityOpen} setOpen={setCreateEntityOpen} />
		</>
	);
}

function ReviewContent() {
	const { product, previewDiff } = useAttachFormContext();
	const itemId = useSheetStore((s) => s.itemId);

	return (
		<>
			<SheetHeader
				title="Review Changes"
				description={
					product
						? `Attaching ${product.name} to this customer`
						: "Review configuration before confirming"
				}
				breadcrumbs={[{ name: "Attach Product", sheet: "attach-product" }]}
				itemId={itemId}
			/>

			{previewDiff.isDiffLoading ? (
				<PlanDiffSkeleton />
			) : (
				<AttachPlanSection readOnly showDiff />
			)}
			<AttachAdvancedSection />
			<ReviewPreviewBlock />
		</>
	);
}

function SendInvoiceContent() {
	const { form, product, previewQuery, isPending, handleInvoiceAttach } =
		useAttachFormContext();
	const { stripeAccount } = useOrgStripeQuery();
	const env = useEnv();
	const { setSheet } = useSheetStore();
	const itemId = useSheetStore((s) => s.itemId);
	const startDate = useStore(form.store, (state) => state.values.startDate);
	const scheduledStartDate = isFutureStartDate(startDate) ? startDate : null;

	return (
		<SendInvoiceStageWithPreview
			productName={product?.name}
			previewQuery={previewQuery}
			isPending={isPending}
			onSubmit={handleInvoiceAttach}
			stripeAccount={stripeAccount}
			env={env}
			onBack={() => setSheet({ type: "attach-review", itemId })}
			scheduledStartDate={scheduledStartDate}
		/>
	);
}

function CheckoutSessionContent() {
	const { product, previewQuery, isPending, handleCheckoutAttach } =
		useAttachFormContext();
	const { setSheet } = useSheetStore();
	const itemId = useSheetStore((s) => s.itemId);

	return (
		<GenerateCheckoutStageWithPreview
			productName={product?.name}
			previewQuery={previewQuery}
			isPending={isPending}
			onSubmit={handleCheckoutAttach}
			onBack={() => setSheet({ type: "attach-review", itemId })}
		/>
	);
}

function SchedulePlanContent() {
	const { product, formValues, previewQuery, isPending, handleConfirm } =
		useAttachFormContext();
	const { setSheet } = useSheetStore();
	const itemId = useSheetStore((s) => s.itemId);

	return (
		<SchedulePlanStageWithPreview
			productName={product?.name}
			startDate={formValues.startDate}
			previewQuery={previewQuery}
			isPending={isPending}
			onSubmit={handleConfirm}
			onBack={() => setSheet({ type: "attach-review", itemId })}
		/>
	);
}

function SheetContent() {
	const sheetType = useSheetStore((s) => s.type);
	const {
		productWithFormItems,
		showPlanEditor,
		handlePlanEditorSave,
		handlePlanEditorCancel,
	} = useAttachFormContext();

	const StageContent =
		sheetType === "attach-send-invoice"
			? SendInvoiceContent
			: sheetType === "attach-checkout-session"
				? CheckoutSessionContent
				: sheetType === "attach-schedule-plan"
					? SchedulePlanContent
					: sheetType === "attach-review"
						? ReviewContent
						: SelectContent;

	return (
		<LayoutGroup>
			<div className="flex flex-col h-full overflow-y-auto">
				<StageContent />

				{productWithFormItems && (
					<InlinePlanEditor
						product={productWithFormItems}
						onSave={handlePlanEditorSave}
						onCancel={handlePlanEditorCancel}
						isOpen={showPlanEditor}
					/>
				)}
			</div>
		</LayoutGroup>
	);
}

export function AttachProductSheet() {
	const itemId = useSheetStore((s) => s.itemId);
	const { closeSheet } = useSheetStore();
	const { customer } = useCusQuery();
	const { setIsInlineEditorOpen } = useCustomerContext();
	const [scopeEntityId, setScopeEntityId] = useSheetScopeEntityId(
		customer as FullCustomer | undefined,
	);

	return (
		<AttachFormProvider
			customerId={customer?.id ?? customer?.internal_id ?? ""}
			entityId={scopeEntityId}
			initialProductId={itemId ?? undefined}
			onPlanEditorOpen={() => setIsInlineEditorOpen(true)}
			onPlanEditorClose={() => setIsInlineEditorOpen(false)}
			onCheckoutRedirect={(checkoutUrl) => {
				navigator.clipboard.writeText(checkoutUrl);
				toast.success("Checkout URL copied to clipboard");
			}}
			onSuccess={closeSheet}
			onScopeChange={setScopeEntityId}
		>
			<SheetContent />
		</AttachFormProvider>
	);
}
