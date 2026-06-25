import { notNullish, productV2ToBasePrice } from "@autumn/shared";
import {
	AreaCheckbox,
	Checkbox,
	Input,
	SheetAccordion,
	SheetAccordionItem,
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@autumn/ui";
import { InfoIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { useParams } from "react-router";
import { hasBillingControls } from "@/components/billing-controls/BillingControlsDisplay";
import {
	useProduct,
	useSheet,
} from "@/components/v2/inline-custom-plan-editor/PlanEditorContext";
import { SheetHeader } from "@/components/v2/sheets/InlineSheet";
import { PlanSheetFooterContainer } from "@/components/v2/sheets/PlanSheetFooterContainer";
import { AdditionalOptions } from "./edit-plan-details/AdditionalOptions";
import { MainDetailsSection } from "./edit-plan-details/MainDetailsSection";
import { MetadataEditor } from "./edit-plan-details/MetadataEditor";
import { PlanBillingControlsSection } from "./edit-plan-details/PlanBillingControlsSection";

export function EditPlanSheet({ isOnboarding }: { isOnboarding?: boolean }) {
	const { product, setProduct } = useProduct();
	const { sheetType } = useSheet();
	const { customer_id } = useParams();
	const isCustomPlan = notNullish(customer_id);

	const hasMetadata = Object.keys(product.metadata ?? {}).length > 0;
	const [metadataOpened, setMetadataOpened] = useState(false);
	const showMetadata = hasMetadata || metadataOpened;

	const hasBillingControlsConfigured = hasBillingControls(
		product.billing_controls,
	);
	const [billingControlsOpened, setBillingControlsOpened] = useState(false);
	const showBillingControls =
		hasBillingControlsConfigured || billingControlsOpened;

	if (!product) return null;

	const basePrice = productV2ToBasePrice({ product });
	const hasGroup = notNullish(product.group);
	const showAdvanced =
		product.planType === "paid" &&
		!basePrice?.price &&
		product.basePriceType !== "usage";

	return (
		<div className="flex flex-col h-full overflow-hidden">
			<div className="flex-1 overflow-y-auto overscroll-none [scrollbar-gutter:stable]">
				{!isOnboarding && (
					<SheetHeader
						title={`Configure ${product.name ? product.name : "your new plan"}`}
						description="Configure the details of this plan"
						noSeparator={true}
					/>
				)}
				<MainDetailsSection />
				<AdditionalOptions />

				{!showAdvanced && (
					<SheetAccordion type="single" withSeparator={false}>
						<SheetAccordionItem value="advanced" title="Advanced">
							<div className="space-y-4">
								<AreaCheckbox
									title="Group"
									description="If your app has multiple groups of subscription tiers, you can choose which group this plan belongs to."
									checked={hasGroup}
									onCheckedChange={(checked) =>
										setProduct({ ...product, group: checked ? "" : null })
									}
								>
									{hasGroup && (
										<Input
											placeholder="Enter group name"
											value={product.group ?? undefined}
											onChange={(e) =>
												setProduct({ ...product, group: e.target.value })
											}
										/>
									)}
								</AreaCheckbox>
								<AreaCheckbox
									title="Ignore past due"
									description="Customers on this plan won't be treated as past due — balances keep resetting normally"
									checked={product.config?.ignore_past_due}
									onCheckedChange={(checked) =>
										setProduct({
											...product,
											config: { ...product.config, ignore_past_due: checked },
										})
									}
								/>
								{isCustomPlan ? (
									<div className="flex items-start gap-[6px] text-sm">
										<Checkbox
											checked={false}
											disabled
											size="sm"
											className="mt-[3px]"
										/>
										<div className="flex items-center gap-1.5">
											<span className="cursor-not-allowed select-none font-medium text-muted-foreground opacity-50">
												Billing controls
											</span>
											<Tooltip>
												<TooltipTrigger asChild>
													<button
														type="button"
														aria-label="Why billing controls are disabled here"
														className="inline-flex cursor-help text-tertiary-foreground"
													>
														<InfoIcon className="size-3.5" weight="fill" />
													</button>
												</TooltipTrigger>
												<TooltipContent side="right" className="max-w-60">
													Billing controls can't be set per subscription. Edit
													the customer's billing controls to change them for
													this customer, or the plan to change the default.
												</TooltipContent>
											</Tooltip>
										</div>
									</div>
								) : (
									<AreaCheckbox
										title="Billing controls"
										description="Default controls applied when this plan is attached."
										checked={showBillingControls}
										onCheckedChange={(checked) => {
											if (checked) {
												setBillingControlsOpened(true);
											} else {
												setBillingControlsOpened(false);
												setProduct({ ...product, billing_controls: {} });
											}
										}}
									>
										{showBillingControls && (
											<PlanBillingControlsSection hideHeader />
										)}
									</AreaCheckbox>
								)}
								<AreaCheckbox
									title="Metadata"
									description="Arbitrary JSON for your own use (e.g. UI copy). Shared across every version of the plan."
									checked={showMetadata}
									onCheckedChange={(checked) => {
										if (checked) {
											setMetadataOpened(true);
										} else {
											setMetadataOpened(false);
											setProduct({ ...product, metadata: {} });
										}
									}}
								>
									{showMetadata && (
										<MetadataEditor key={product.internal_id ?? product.id} />
									)}
								</AreaCheckbox>
							</div>
						</SheetAccordionItem>
					</SheetAccordion>
				)}
			</div>

			<PlanSheetFooterContainer sheetType={sheetType} />
		</div>
	);
}
