import type { CreditSchemaItem } from "@autumn/shared";
import { CreditDimensionProvider } from "../hooks/CreditDimensionContext";
import { formatCredits } from "../utils/creditRateSummary";
import { isGraduated } from "../utils/creditSchemaUtils";
import { CreditDimensionFieldTable } from "./CreditDimensionFieldTable";
import { CreditDimensionMultiplierTable } from "./CreditDimensionMultiplierTable";
import { CreditDimensionRateTable } from "./CreditDimensionRateTable";

interface CreditDimensionPriceListProps {
	item: CreditSchemaItem;
	onChange: (item: CreditSchemaItem) => void;
}

/** Three tables: the dimensions and their values, then rates and multipliers with a column per dimension. */
export function CreditDimensionPriceList({
	item,
	onChange,
}: CreditDimensionPriceListProps) {
	const baseRate = isGraduated(item)
		? "the tiered rate"
		: formatCredits(item.credit_amount ?? 0);

	return (
		<CreditDimensionProvider item={item} onChange={onChange}>
			<div className="flex flex-col gap-3">
				<CreditDimensionFieldTable />
				<CreditDimensionRateTable baseRate={baseRate} />
				<CreditDimensionMultiplierTable />
			</div>
		</CreditDimensionProvider>
	);
}
