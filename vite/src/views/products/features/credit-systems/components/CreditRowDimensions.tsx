import type { CreditSchemaItem } from "@autumn/shared";
import { Button } from "@autumn/ui";
import { CreditDimensionPriceList } from "./CreditDimensionPriceList";

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
					className="text-tertiary-foreground text-xs hover:text-foreground!"
					onClick={onRemove}
				>
					Remove dimensions
				</Button>
			}
		/>
	);
}
