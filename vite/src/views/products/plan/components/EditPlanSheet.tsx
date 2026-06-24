import { notNullish, productV2ToBasePrice } from "@autumn/shared";
import {
	AreaCheckbox,
	Input,
	SheetAccordion,
	SheetAccordionItem,
} from "@autumn/ui";
import { useState } from "react";
import { useProduct } from "@/components/v2/inline-custom-plan-editor/PlanEditorContext";
import { SheetHeader } from "@/components/v2/sheets/InlineSheet";
import { AdditionalOptions } from "./edit-plan-details/AdditionalOptions";
import { MainDetailsSection } from "./edit-plan-details/MainDetailsSection";
import { MetadataEditor } from "./edit-plan-details/MetadataEditor";
import { PlanBillingControlsSection } from "./edit-plan-details/PlanBillingControlsSection";

export function EditPlanSheet({ isOnboarding }: { isOnboarding?: boolean }) {
	const { product, setProduct } = useProduct();

	const basePrice = productV2ToBasePrice({ product });

	const hasGroup = notNullish(product.group);

	const hasMetadata = Object.keys(product.metadata ?? {}).length > 0;
	const [metadataOpened, setMetadataOpened] = useState(false);
	const showMetadata = hasMetadata || metadataOpened;

	if (!product) return null;

	const showAdvanced =
		product.planType === "paid" &&
		!basePrice?.price &&
		product.basePriceType !== "usage";

	return (
		<div className="h-full overflow-y-auto overscroll-none [scrollbar-gutter:stable]">
			{!isOnboarding && (
				<SheetHeader
					title={`Configure ${product.name ? product.name : "your new plan"}`}
					description="Configure the details of this plan"
					noSeparator={true}
				/>
			)}
			<MainDetailsSection />
			{/* <PlanTypeSection /> */}
			{/* <BasePriceSection /> */}

			{/* <FreeTrialSection /> */}
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
							<PlanBillingControlsSection />
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
	);
}
