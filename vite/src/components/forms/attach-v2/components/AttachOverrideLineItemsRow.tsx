import { Switch } from "@autumn/ui";
import { useState } from "react";
import { ConfigRow } from "@/components/forms/shared/ConfigRow";
import {
	addCustomLineItem,
	CustomLineItemRows,
	removeCustomLineItem,
	updateCustomLineItem,
} from "@/components/forms/shared/CustomLineItemRows";
import type { FormCustomLineItem } from "../attachFormSchema";

export function AttachOverrideLineItemsRow({
	lineItems,
	onLineItemsChange,
}: {
	lineItems: FormCustomLineItem[];
	onLineItemsChange: (lineItems: FormCustomLineItem[]) => void;
}) {
	const [enabled, setEnabled] = useState(lineItems.length > 0);

	return (
		<ConfigRow
			title="Override Line Items"
			description="Replace default invoice line items with custom amounts"
			expanded={enabled}
			action={
				<Switch
					checked={enabled}
					onCheckedChange={(checked) => {
						setEnabled(!!checked);
						if (!checked) onLineItemsChange([]);
					}}
				/>
			}
		>
			<CustomLineItemRows
				lineItems={lineItems}
				onAdd={() => onLineItemsChange(addCustomLineItem(lineItems))}
				onUpdate={({ index, field, value }) =>
					onLineItemsChange(
						updateCustomLineItem({ lineItems, index, field, value }),
					)
				}
				onRemove={({ index }) =>
					onLineItemsChange(removeCustomLineItem(lineItems, index))
				}
			/>
		</ConfigRow>
	);
}
