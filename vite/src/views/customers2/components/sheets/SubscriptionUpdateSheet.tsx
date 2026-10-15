import type {
	FrontendProduct,
	FullCusProduct,
	ProductItem,
	ProductV2,
} from "@autumn/shared";
import { CusProductStatus, cp, LONG_LIVED_CHECKOUT_PATH } from "@autumn/shared";
import { useMemo } from "react";
import { toast } from "sonner";
import { BillingPromptToggle } from "@/components/forms/shared/generation/BillingPromptToggle";
import { SendInvoiceStageWithPreview } from "@/components/forms/shared/SendInvoiceStage";
import {
	WarningBanner,
	type WarningBannerLine,
} from "@/components/forms/shared/WarningBanner";
import {
	EditPlanSection,
	UpdateSubscriptionAdvancedSection,
	UpdateSubscriptionFooter,
	type UpdateSubscriptionForm,
	type UpdateSubscriptionFormContext,
	UpdateSubscriptionFormProvider,
	UpdateSubscriptionGenerationBar,
	UpdateSubscriptionPreviewSection,
	useUpdateSubscriptionFormContext,
} from "@/components/forms/update-subscription-v2";
import {
	customerLicensesToCustomizePlanLicenses,
	getSupportedFormOverridesFromProductCustomization,
} from "@/components/forms/update-subscription-v2/utils/subscriptionCustomization";
import { InlinePlanEditor } from "@/components/v2/inline-custom-plan-editor/InlinePlanEditor";
import {
	LayoutGroup,
	SheetBody,
	SheetHeader,
} from "@/components/v2/sheets/SharedSheetComponents";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import { useLicenseProductsQuery } from "@/hooks/queries/useLicenseProductsQuery";
import { useOrgStripeQuery } from "@/hooks/queries/useOrgStripeQuery";
import { useProductVersionQuery } from "@/hooks/queries/useProductVersionQuery";
import { usePrepaidItems } from "@/hooks/stores/useProductStore";
import { useSheetStore } from "@/hooks/stores/useSheetStore";
import { useSubscriptionById } from "@/hooks/stores/useSubscriptionStore";
import { cn } from "@/lib/utils";
import { useEnv } from "@/utils/envUtils";
import { useSettleApprovalOnApply } from "@/views/approvals/hooks/useSettleApprovalOnApply";
import { approvalSeedFromSheetData } from "@/views/approvals/utils/approvalSheetIntegration";
import { useCusQuery } from "@/views/customers/customer/hooks/useCusQuery";
import { useCustomerContext } from "@/views/customers2/customer/CustomerContext";
import { InfoBox } from "@/views/onboarding2/integrate/components/InfoBox";
import { usePendingPaymentLink } from "./usePendingPaymentLink";

const isLongLivedCheckoutUrl = (url: string) =>
	new URL(url).pathname.split("/")[1] === LONG_LIVED_CHECKOUT_PATH;

function SendInvoiceContent() {
	const { formContext, isPending, handleInvoiceUpdate, previewQuery } =
		useUpdateSubscriptionFormContext();
	const { customerProduct } = formContext;
	const { stripeAccount } = useOrgStripeQuery();
	const env = useEnv();
	const { setSheet } = useSheetStore();
	const itemId = useSheetStore((s) => s.itemId);

	return (
		<LayoutGroup>
			<SheetBody>
				<SendInvoiceStageWithPreview
					productName={customerProduct.product.name}
					previewQuery={previewQuery}
					isPending={isPending}
					onSubmit={handleInvoiceUpdate}
					stripeAccount={stripeAccount}
					env={env}
					onBack={() => setSheet({ type: "subscription-update", itemId })}
				/>
			</SheetBody>
		</LayoutGroup>
	);
}

function EditContent() {
	const {
		formContext,
		hasChanges,
		hasNoBillingChanges,
		showPlanEditor,
		productWithFormItems,
		handlePlanEditorSave,
		handlePlanEditorCancel,
		formValues,
	} = useUpdateSubscriptionFormContext();
	const { customer } = useCusQuery();

	const { customerProduct } = formContext;
	const isPendingPlan = customerProduct.status === CusProductStatus.Pending;
	const { data: pendingPaymentLink } = usePendingPaymentLink({
		customerId: formContext.customerId,
		customerProductId: customerProduct.id,
		enabled: isPendingPlan,
	});

	const stripeSubscriptionId = customerProduct.subscription_ids?.[0];
	const replacedPlan =
		isPendingPlan && stripeSubscriptionId
			? customer?.customer_products.find(
					(live: FullCusProduct) =>
						cp(live)
							.hasActiveStatus()
							.hasProductId({ productId: customerProduct.product.id })
							.onEntity({
								internalEntityId:
									customerProduct.internal_entity_id ?? undefined,
							})
							.onStripeSubscription({ stripeSubscriptionId }).valid,
				)
			: undefined;

	const warningLines: WarningBannerLine[] = [];
	if (replacedPlan) {
		warningLines.push({
			key: "replaces-plan",
			severity: "warning",
			content: `This pending plan will replace the existing ${replacedPlan.product.name} plan.`,
		});
	}
	if (isPendingPlan && hasChanges && !hasNoBillingChanges) {
		warningLines.push(
			pendingPaymentLink?.longLived
				? {
						key: "payment-link",
						severity: "info",
						content: "Reuses the existing checkout link.",
					}
				: {
						key: "payment-link",
						severity: "warning",
						content:
							"Updating creates a new payment link. The existing one will stop working.",
					},
		);
	}

	return (
		<LayoutGroup>
			<SheetBody>
				<SheetHeader
					title="Update Subscription"
					description={`Update ${customerProduct.product.name} for this customer`}
					breadcrumbs={[
						{
							name: customerProduct.product.name,
							sheet: "subscription-detail",
						},
					]}
					itemId={customerProduct.id}
					action={<BillingPromptToggle />}
				/>

				<div className="has-[form]:px-4 has-[form]:pt-4">
					<UpdateSubscriptionGenerationBar />
				</div>

				<div
					className={cn(
						"grid px-4 transition-[grid-template-rows] duration-200 ease-out",
						!hasNoBillingChanges && "delay-75",
					)}
					style={{
						gridTemplateRows: hasNoBillingChanges ? "1fr" : "0fr",
					}}
				>
					<div className="overflow-hidden">
						<div
							className={cn(
								"pt-4 transition-opacity duration-150",
								hasNoBillingChanges ? "opacity-100 delay-75" : "opacity-0",
							)}
						>
							<InfoBox variant="success" classNames={{ infoBox: "w-full" }}>
								No changes to billing will be made
							</InfoBox>
						</div>
					</div>
				</div>

				<WarningBanner lines={warningLines} />

				<EditPlanSection />
				<UpdateSubscriptionAdvancedSection />
				<UpdateSubscriptionPreviewSection />
				<UpdateSubscriptionFooter />

				{productWithFormItems && (
					<InlinePlanEditor
						product={productWithFormItems}
						onSave={handlePlanEditorSave}
						onCancel={handlePlanEditorCancel}
						isOpen={showPlanEditor}
						enableLicenseEditing
						initialAddLicenses={formValues.addLicenses}
					/>
				)}
			</SheetBody>
		</LayoutGroup>
	);
}

function SheetContent() {
	const sheetType = useSheetStore((s) => s.type);

	return sheetType === "subscription-update-send-invoice" ? (
		<SendInvoiceContent />
	) : (
		<EditContent />
	);
}

export function SubscriptionUpdateSheet() {
	const itemId = useSheetStore((s) => s.itemId);
	const sheetData = useSheetStore((s) => s.data);
	const { closeSheet } = useSheetStore();
	const { customer } = useCusQuery();
	const { setIsInlineEditorOpen } = useCustomerContext();

	const { cusProduct, productV2 } = useSubscriptionById({ itemId });
	const { prepaidItems } = usePrepaidItems({ product: productV2 });
	const { features, isLoading: featuresLoading } = useFeaturesQuery();
	const { licenseProducts, isLoading: licenseProductsLoading } =
		useLicenseProductsQuery({ allVersions: true });

	const { data: productData } = useProductVersionQuery({
		productId: productV2?.id,
	});

	const numVersions = productData?.numVersions ?? productV2?.version ?? 1;
	const currentVersion = cusProduct?.product?.version ?? 1;
	const customizedProduct = sheetData?.customizedProduct as
		| FrontendProduct
		| undefined;

	const approvalSeed = approvalSeedFromSheetData(sheetData ?? null);
	const onApplied = useSettleApprovalOnApply();
	const defaultOverrides = useMemo((): Partial<UpdateSubscriptionForm> => {
		if (!productV2) return {};
		return {
			...getSupportedFormOverridesFromProductCustomization({
				customizedProduct,
				baseProduct: productV2 as FrontendProduct,
				currentVersion,
			}),
			addLicenses: customerLicensesToCustomizePlanLicenses({
				customerLicenses: cusProduct?.customer_licenses,
				licenseProducts,
				features,
			}),
			...(approvalSeed?.defaultOverrides as
				| Partial<UpdateSubscriptionForm>
				| undefined),
		};
	}, [
		approvalSeed?.defaultOverrides,
		customizedProduct,
		cusProduct?.customer_licenses,
		features,
		licenseProducts,
		productV2,
		currentVersion,
	]);

	const formContext = useMemo(
		(): UpdateSubscriptionFormContext | null =>
			cusProduct && productV2
				? {
						customerId: customer?.id ?? customer?.internal_id,
						product: productV2 as ProductV2,
						entityId: cusProduct?.entity_id ?? undefined,
						customerProduct: cusProduct as FullCusProduct,
						prepaidItems,
						numVersions,
						currentVersion,
					}
				: null,
		[
			customer,
			cusProduct,
			productV2,
			prepaidItems,
			numVersions,
			currentVersion,
		],
	);

	if (!cusProduct) {
		return (
			<div className="flex flex-col h-full">
				<SheetHeader
					title="Update Subscription"
					description="Loading subscription..."
				/>
				<div className="p-4 text-sm text-tertiary-foreground">Loading...</div>
			</div>
		);
	}

	if (!productV2) {
		return (
			<div className="flex flex-col h-full">
				<SheetHeader
					title="Update Subscription"
					description="Loading product..."
				/>
				<div className="p-4 text-sm text-tertiary-foreground">
					Loading product data...
				</div>
			</div>
		);
	}

	if (featuresLoading || licenseProductsLoading) {
		return (
			<div className="flex flex-col h-full">
				<SheetHeader
					title="Update Subscription"
					description="Loading plan configuration..."
				/>
				<div className="p-4 text-sm text-tertiary-foreground">Loading...</div>
			</div>
		);
	}

	if (!formContext) {
		return (
			<div className="flex flex-col h-full">
				<SheetHeader title="Update Subscription" description="Loading..." />
				<div className="p-4 text-sm text-tertiary-foreground">Loading...</div>
			</div>
		);
	}

	return (
		<UpdateSubscriptionFormProvider
			formContext={formContext}
			originalItems={productV2?.items as ProductItem[] | undefined}
			defaultOverrides={defaultOverrides}
			onPlanEditorOpen={() => setIsInlineEditorOpen(true)}
			onPlanEditorClose={() => setIsInlineEditorOpen(false)}
			onCheckoutRedirect={(checkoutUrl) => {
				// A long-lived link means the edit kept the customer's link; read it off the response so a slow lookup can't misroute.
				if (isLongLivedCheckoutUrl(checkoutUrl)) {
					toast.success("Checkout link updated");
					return;
				}
				window.location.href = checkoutUrl;
			}}
			onApplied={onApplied}
			onSuccess={closeSheet}
		>
			<SheetContent />
		</UpdateSubscriptionFormProvider>
	);
}
