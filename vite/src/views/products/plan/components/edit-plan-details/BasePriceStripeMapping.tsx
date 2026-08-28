import type { ProductItem } from "@autumn/shared";
import { FormLabel, SheetAccordion, SheetAccordionItem } from "@autumn/ui";
import { StripePriceSelect } from "@/components/v2/selects/StripePriceSelect";
import {
	itemStripePriceId,
	withItemStripePriceId,
} from "../shared/stripePriceMapping";

/**
 * Maps this plan version's base price to an existing Stripe price. Versions
 * price separately, so the mapping belongs to the version being edited rather
 * than to the plan.
 */
export const BasePriceStripeMapping = ({
	item,
	setItem,
}: {
	item: ProductItem;
	setItem: (item: ProductItem) => void;
}) => (
	<SheetAccordion collapsible={true} type="single" withSeparator={false}>
		<SheetAccordionItem title="Advanced" value="advanced">
			<div className="flex flex-col gap-2 pt-2 pb-4">
				<FormLabel>Stripe price</FormLabel>
				<StripePriceSelect
					onChange={(stripePriceId) =>
						setItem(withItemStripePriceId({ item, stripePriceId }))
					}
					value={itemStripePriceId({ item })}
				/>
				<p className="text-tertiary-foreground text-xs">
					Bill this version under a Stripe price you already have. Applies to
					this version only.
				</p>
			</div>
		</SheetAccordionItem>
	</SheetAccordion>
);
