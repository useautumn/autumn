import {
	isPriceItem,
	type ProductItem,
	productV2ToPlanType,
} from "@autumn/shared";
import { PanelButton } from "@autumn/ui";
import { CoinsIcon } from "@phosphor-icons/react";
import { IncludedUsageIcon } from "@/components/v2/icons/AutumnIcons";
import { useProduct } from "@/components/v2/inline-custom-plan-editor/PlanEditorContext";
import { SheetSection } from "@/components/v2/sheets/InlineSheet";

export const PlanTypeSection = () => {
	const { product, setProduct } = useProduct();

	const planType = productV2ToPlanType({ product });

	return (
		<SheetSection title="Select Plan Type">
			<div className="space-y-4">
				<div className="mt-3 space-y-4">
					<div className="flex w-full items-center gap-4">
						<PanelButton
							isSelected={planType === "free"}
							onClick={() => {
								setProduct({
									...product,
									planType: "free",
									basePriceType: null,
									items:
										product.items?.filter(
											(item: ProductItem) => !isPriceItem(item),
										) ?? [],
								});
							}}
							icon={<IncludedUsageIcon size={16} color="currentColor" />}
						/>
						<div className="flex-1">
							<div className="text-body-highlight mb-1 flex-row flex items-center gap-1">
								Free
								{/* <InfoIcon size={8} weight="regular" color="#888888" /> */}
							</div>
							<div className="text-body-secondary leading-tight">
								A plan without pricing that customers can use for free
							</div>
						</div>
					</div>

					<div className="flex w-full items-center gap-4">
						<PanelButton
							isSelected={planType === "paid"}
							onClick={async () => {
								setProduct({
									...product,
									planType: "paid",
									basePriceType: "usage",
									is_default: false,
									items: product.items.filter(
										(item: ProductItem) => !isPriceItem(item),
									),
								});
							}}
							icon={<CoinsIcon size={16} color="currentColor" />}
						/>
						<div className="flex-1">
							<div className="text-body-highlight mb-1 flex-row flex items-center gap-1">
								Paid
								{/* <InfoIcon size={8} weight="regular" color="#888888" /> */}
							</div>
							<div className="text-body-secondary leading-tight">
								A plan with fixed or usage-based pricing that customers may
								purchase
							</div>
						</div>
					</div>
				</div>
			</div>
		</SheetSection>
	);
};
