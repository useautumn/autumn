import { notNullish, productV2ToBasePrice } from "@autumn/shared";
import {
	AreaCheckbox,
	Input,
	SheetAccordion,
	SheetAccordionItem,
} from "@autumn/ui";
import {
	useProduct,
	useSheet,
} from "@/components/v2/inline-custom-plan-editor/PlanEditorContext";
import { SheetHeader } from "@/components/v2/sheets/InlineSheet";
import { PlanSheetFooterContainer } from "@/components/v2/sheets/PlanSheetFooterContainer";
import { AdditionalOptions } from "./edit-plan-details/AdditionalOptions";
import { MainDetailsSection } from "./edit-plan-details/MainDetailsSection";

export function EditPlanSheet({ isOnboarding }: { isOnboarding?: boolean }) {
	const { product, setProduct } = useProduct();
	const { sheetType } = useSheet();

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
							</div>
						</SheetAccordionItem>
					</SheetAccordion>
				)}
			</div>

			<PlanSheetFooterContainer sheetType={sheetType} />
		</div>
	);
}
