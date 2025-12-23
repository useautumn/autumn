import { notNullish, productV2ToBasePrice } from "@autumn/shared";
import { AreaCheckbox } from "@/components/v2/checkboxes/AreaCheckbox";
import { Input } from "@/components/v2/inputs/Input";
import { SheetHeader } from "@/components/v2/sheets/InlineSheet";
import {
	SheetAccordion,
	SheetAccordionItem,
} from "@/components/v2/sheets/SheetAccordion";
import { useProductStore } from "@/hooks/stores/useProductStore";
import { AdditionalOptions } from "./edit-plan-details/AdditionalOptions";
import { MainDetailsSection } from "./edit-plan-details/MainDetailsSection";

export function EditPlanSheet({ isOnboarding }: { isOnboarding?: boolean }) {
	const product = useProductStore((s) => s.product);
	const setProduct = useProductStore((s) => s.setProduct);

	const basePrice = productV2ToBasePrice({ product });

	const hasGroup = notNullish(product.group);

	if (!product) return null;

	const showAdvanced =
		product.planType === "paid" &&
		!basePrice?.price &&
		product.basePriceType !== "usage";

	return (
		<div className="h-full overflow-y-auto [scrollbar-gutter:stable]">
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
						<div className="space-y-2">
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
						</div>
					</SheetAccordionItem>
				</SheetAccordion>
			)}
		</div>
	);
}
