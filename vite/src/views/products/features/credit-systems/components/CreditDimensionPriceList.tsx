import type { CreditSchemaItem } from "@autumn/shared";
import type { ReactNode } from "react";
import { CreditDimensionProvider } from "../hooks/CreditDimensionContext";
import { CreditDimensionFieldTable } from "./CreditDimensionFieldTable";
import { CreditDimensionMultiplierTable } from "./CreditDimensionMultiplierTable";
import { CreditDimensionRateTable } from "./CreditDimensionRateTable";

interface CreditDimensionPriceListProps {
	item: CreditSchemaItem;
	onChange: (item: CreditSchemaItem) => void;
	/** Rendered beside the Dimensions title, e.g. a remove action. */
	fieldsAction?: ReactNode;
}

/** Three tables: the dimensions and their values, then rates and multipliers with a column per dimension. */
export function CreditDimensionPriceList({
	item,
	onChange,
	fieldsAction,
}: CreditDimensionPriceListProps) {
	return (
		<CreditDimensionProvider item={item} onChange={onChange}>
			<div className="flex flex-col gap-3">
				<CreditDimensionFieldTable action={fieldsAction} />
				<CreditDimensionRateTable />
				<CreditDimensionMultiplierTable />
			</div>
		</CreditDimensionProvider>
	);
}
