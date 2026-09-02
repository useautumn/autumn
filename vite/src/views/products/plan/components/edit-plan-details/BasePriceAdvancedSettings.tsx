import { isPriceItem, type ProductItem } from "@autumn/shared";
import { FormLabel, SheetAccordion, SheetAccordionItem } from "@autumn/ui";
import { useProduct } from "@/components/v2/inline-custom-plan-editor/PlanEditorContext";
import { StripePriceSelect } from "@/components/v2/selects/StripePriceSelect";
import {
	itemStripePriceId,
	withItemStripePriceId,
} from "../shared/stripePriceMapping";

/**
 * Versions price separately, so a base price maps to its own Stripe price
 * rather than inheriting the plan's product.
 */
export function BasePriceAdvancedSettings() {
	const { product, setProduct } = useProduct();

	const basePriceIndex = product?.items?.findIndex(isPriceItem) ?? -1;
	const basePriceItem: ProductItem | undefined =
		basePriceIndex === -1 ? undefined : product.items[basePriceIndex];

	if (!basePriceItem) return null;

	const setBasePriceItem = (item: ProductItem) => {
		const items = [...product.items];
		items[basePriceIndex] = item;
		setProduct({ ...product, items });
	};

	return (
		<SheetAccordion collapsible={true} type="single" withSeparator={false}>
			<SheetAccordionItem title="Advanced" value="advanced">
				<div className="flex flex-col gap-2 pt-2 pb-10">
					<FormLabel>Stripe price</FormLabel>
					<StripePriceSelect
						onChange={(stripePriceId) =>
							setBasePriceItem(
								withItemStripePriceId({ item: basePriceItem, stripePriceId }),
							)
						}
						value={itemStripePriceId({ item: basePriceItem })}
					/>
					<p className="text-tertiary-foreground text-xs">
						Bill this version under a Stripe price you already have.
					</p>
				</div>
			</SheetAccordionItem>
		</SheetAccordion>
	);
}
