import type { CreditSchemaItem } from "@autumn/shared";
import { hasCreditDimensionRules } from "@autumn/shared";
import { Switch } from "@autumn/ui";
import { useState } from "react";
import { withoutDimensions } from "../utils/creditDimensionUtils";
import { CreditDimensionPriceList } from "./CreditDimensionPriceList";

/** One row's dimensions: the switch opens the tables, and off strips only this row's rules. */
export function CreditRowDimensions({
	item,
	onChange,
}: {
	item: CreditSchemaItem;
	onChange: (item: CreditSchemaItem) => void;
}) {
	const [open, setOpen] = useState(false);
	const enabled = open || hasCreditDimensionRules(item);

	const setEnabled = (next: boolean) => {
		setOpen(next);
		if (!next) onChange(withoutDimensions(item));
	};

	return (
		<div className="flex flex-col gap-2">
			<div className="flex items-center justify-between gap-4">
				<div className="flex flex-col gap-0.5">
					<span className="text-sm">Dimensions</span>
					<span className="text-tertiary-foreground text-xs">
						Price by an event property such as size or region.
					</span>
				</div>
				<Switch
					aria-label="Dimensions"
					checked={enabled}
					onCheckedChange={setEnabled}
				/>
			</div>
			{enabled && <CreditDimensionPriceList item={item} onChange={onChange} />}
		</div>
	);
}
