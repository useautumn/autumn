import type { CreditSchemaItem } from "@autumn/shared";
import { Button } from "@autumn/ui";
import { CreditDimensionPriceList } from "./CreditDimensionPriceList";

/** One row's dimension tables, with a single action that strips only this row's rules. */
export function CreditRowDimensions({
	item,
	onChange,
	onRemove,
}: {
	item: CreditSchemaItem;
	onChange: (item: CreditSchemaItem) => void;
	onRemove: () => void;
}) {
	return (
		<CreditDimensionPriceList
			item={item}
			onChange={onChange}
			fieldsAction={
				<Button
					type="button"
					variant="skeleton"
					size="sm"
					className="text-tertiary-foreground text-xs hover:text-red-500"
					onClick={onRemove}
				>
					Remove dimensions
				</Button>
			}
		/>
	);
}
