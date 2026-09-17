import { SheetAccordion, SheetAccordionItem } from "@autumn/ui";
import {
	addCustomLineItem,
	CustomLineItemRows,
	removeCustomLineItem,
	updateCustomLineItem,
} from "@/components/forms/shared/CustomLineItemRows";
import { DiscountRow } from "@/components/forms/shared/discount-row/DiscountRow";
import { SheetSection } from "@/components/v2/sheets/SharedSheetComponents";
import {
	addDiscount,
	removeDiscount,
	updateDiscount,
} from "../../attach-v2/utils/discountUtils";
import { useCreateInvoiceFormContext } from "../context/CreateInvoiceFormProvider";
import { AddRowAction } from "./AddRowAction";
import { CreateInvoiceSettingsFields } from "./CreateInvoiceSettingsFields";

export function CreateInvoiceAdvancedSection() {
	const { form, formValues } = useCreateInvoiceFormContext();
	const { customLineItems, discounts } = formValues;

	return (
		<>
			<SheetSection title="Discounts" withSeparator>
				<div className="space-y-2">
					{discounts.map((discount, index) => (
						<DiscountRow
							defaultOpen={!("reward_id" in discount && discount.reward_id)}
							discounts={discounts}
							index={index}
							key={discount._id}
							onRemove={() =>
								form.setFieldValue(
									"discounts",
									removeDiscount(discounts, index),
								)
							}
							onUpdate={({ rewardId }) =>
								form.setFieldValue(
									"discounts",
									updateDiscount(discounts, index, { reward_id: rewardId }),
								)
							}
							productId={undefined}
						/>
					))}

					<AddRowAction
						count={discounts.length}
						noun="discount"
						onAdd={() =>
							form.setFieldValue("discounts", addDiscount(discounts))
						}
					/>
				</div>
			</SheetSection>

			<SheetSection title="Custom charges" withSeparator>
				<div className="space-y-2">
					<CustomLineItemRows
						hideAddButton
						lineItems={customLineItems}
						onAdd={() =>
							form.setFieldValue(
								"customLineItems",
								addCustomLineItem(customLineItems),
							)
						}
						onRemove={({ index }) =>
							form.setFieldValue(
								"customLineItems",
								removeCustomLineItem(customLineItems, index),
							)
						}
						onUpdate={({ index, field, value }) =>
							form.setFieldValue(
								"customLineItems",
								updateCustomLineItem({
									lineItems: customLineItems,
									index,
									field,
									value,
								}),
							)
						}
					/>

					<AddRowAction
						count={customLineItems.length}
						noun="charge"
						onAdd={() =>
							form.setFieldValue(
								"customLineItems",
								addCustomLineItem(customLineItems),
							)
						}
					/>
				</div>
			</SheetSection>

			<SheetAccordion>
				<SheetAccordionItem title="Invoice settings" value="invoice-settings">
					<CreateInvoiceSettingsFields />
				</SheetAccordionItem>
			</SheetAccordion>
		</>
	);
}
