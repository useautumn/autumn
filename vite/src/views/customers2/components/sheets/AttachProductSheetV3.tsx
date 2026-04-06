import type { Entity, FullCustomer } from "@autumn/shared";
import { ArrowLeft } from "@phosphor-icons/react";
import { useState } from "react";
import { toast } from "sonner";
import {
	AttachAdvancedSection,
	AttachFormProvider,
	AttachPlanOptions,
	AttachPlanSection,
	AttachPreviewSection,
	AttachProductSelection,
	AttachUpdatesSection,
	useAttachFormContext,
} from "@/components/forms/attach-v2";
import { AttachFooterV3 } from "@/components/forms/attach-v2/components/AttachFooterV3";
import { Button } from "@/components/v2/buttons/Button";
import { InlinePlanEditor } from "@/components/v2/inline-custom-plan-editor/InlinePlanEditor";
import {
	LayoutGroup,
	SheetFooter,
	SheetHeader,
	SheetSection,
} from "@/components/v2/sheets/SharedSheetComponents";
import { useOrgStripeQuery } from "@/hooks/queries/useOrgStripeQuery";
import { useSheetStore } from "@/hooks/stores/useSheetStore";
import { useEntity } from "@/hooks/stores/useSubscriptionStore";
import { useEnv } from "@/utils/envUtils";
import { getStripeInvoiceLink } from "@/utils/linkUtils";
import { useCusQuery } from "@/views/customers/customer/hooks/useCusQuery";
import { useCustomerContext } from "@/views/customers2/customer/CustomerContext";
import { InfoBox } from "@/views/onboarding2/integrate/components/InfoBox";

function SheetContent() {
	const [stage, setStage] = useState<"select" | "review">("select");

	const {
		formValues,
		productWithFormItems,
		product,
		showPlanEditor,
		handlePlanEditorSave,
		handlePlanEditorCancel,
		previewQuery,
	} = useAttachFormContext();

	const { closeSheet } = useSheetStore();
	const hasProductSelected = !!formValues.productId;

	const { entityId } = useEntity();
	const { customer } = useCusQuery();
	const fullCustomer = customer as FullCustomer | null;
	const entities = fullCustomer?.entities || [];
	const fullEntity = entities.find(
		(e: Entity) => e.id === entityId || e.internal_id === entityId,
	);

	const isPreviewReady =
		hasProductSelected &&
		!previewQuery.isLoading &&
		!previewQuery.error &&
		!!previewQuery.data;

	return (
		<LayoutGroup>
			<div className="flex flex-col h-full overflow-y-auto">
				{stage === "select" ? (
					<>
						<SheetHeader
							title="Attach Product"
							description="Select and configure a product to attach to this customer"
						/>

						<SheetSection withSeparator={false} className="pb-0">
							<div className="space-y-2">
								<AttachProductSelection />

								{entityId ? (
									<div className="pt-2">
										<InfoBox variant="info">
											Attaching plan to entity{" "}
											<span className="font-semibold">
												{fullEntity?.name || fullEntity?.id}
											</span>
										</InfoBox>
									</div>
								) : entities.length > 0 ? (
									<div className="pt-2">
										<InfoBox variant="info">
											Attaching plan to customer - all entities will get access
										</InfoBox>
									</div>
								) : null}
							</div>
						</SheetSection>

						{hasProductSelected && (
							<>
								<AttachPlanSection />
								<SheetSection withSeparator>
									<AttachPlanOptions />
								</SheetSection>
								<SheetFooter>
									<Button variant="secondary" onClick={closeSheet}>
										Cancel
									</Button>
									<Button
										variant="primary"
										onClick={() => setStage("review")}
										disabled={!isPreviewReady}
									>
										Preview Changes
									</Button>
								</SheetFooter>
							</>
						)}
					</>
				) : (
					<>
						<SheetHeader
							title="Review Changes"
							description={
								product
									? `Attaching ${product.name} to this customer`
									: "Review configuration before confirming"
							}
						>
							<button
								type="button"
								onClick={() => setStage("select")}
								className="flex items-center gap-1 text-t3 text-sm cursor-pointer mt-2 hover:text-foreground transition-colors"
							>
								<ArrowLeft size={14} />
								Back
							</button>
						</SheetHeader>

						<AttachPlanSection readOnly />
						<AttachAdvancedSection />
						<AttachUpdatesSection />
						<AttachPreviewSection />
						<AttachFooterV3 />
					</>
				)}

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

export function AttachProductSheetV3() {
	const itemId = useSheetStore((s) => s.itemId);
	const { closeSheet } = useSheetStore();
	const { customer } = useCusQuery();
	const { stripeAccount } = useOrgStripeQuery();
	const env = useEnv();
	const { setIsInlineEditorOpen } = useCustomerContext();
	const { entityId } = useEntity();

	return (
		<AttachFormProvider
			customerId={customer?.id ?? customer?.internal_id ?? ""}
			entityId={entityId ?? undefined}
			initialProductId={itemId ?? undefined}
			onPlanEditorOpen={() => setIsInlineEditorOpen(true)}
			onPlanEditorClose={() => setIsInlineEditorOpen(false)}
			onInvoiceCreated={(invoiceId) => {
				const invoiceLink = getStripeInvoiceLink({
					stripeInvoice: invoiceId,
					env,
					accountId: stripeAccount?.id,
				});
				window.open(invoiceLink, "_blank");
			}}
			onCheckoutRedirect={(checkoutUrl) => {
				navigator.clipboard.writeText(checkoutUrl);
				toast.success("Checkout URL copied to clipboard");
			}}
			onSuccess={closeSheet}
		>
			<SheetContent />
		</AttachFormProvider>
	);
}
