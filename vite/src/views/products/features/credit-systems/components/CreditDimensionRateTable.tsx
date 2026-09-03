import { IconButton } from "@autumn/ui";
import { GridFourIcon } from "@phosphor-icons/react";
import type { ColumnDef } from "@tanstack/react-table";
import { PlusIcon } from "lucide-react";
import { useMemo } from "react";
import { useProductTable } from "@/views/products/hooks/useProductTable";
import {
	type CreditMatch,
	type CreditRateRow,
	type DimensionValues,
	MAX_FILLED_COMBINATIONS,
} from "../utils/creditDimensionUtils";
import { CreditEditableTable } from "./CreditEditableTable";
import { CreditNumberInput } from "./CreditNumberInput";
import {
	type MatchCellContext,
	type MatchRow,
	type MatchTableMeta,
	MutedCell,
	matchColumns,
	metaOf,
	removeColumn,
} from "./creditMatchColumns";

interface RateRow extends MatchRow {
	rate: CreditRateRow;
	inherited: string;
}

interface RateTableMeta extends MatchTableMeta {
	onCreditsChange: (index: number, credits: number | undefined) => void;
}

const rowLabel = (row: CreditRateRow) => row.name || "new rate";

/** A draft row shows the cost it would inherit as its placeholder; typing one makes it a rule. */
const creditsColumn: ColumnDef<RateRow, unknown> = {
	header: "Credits",
	id: "credits",
	size: 90,
	cell: ({ row, table }: MatchCellContext<RateRow>) => {
		const { rate, index, label, inherited } = row.original;
		if (rate.dimension?.tier_behavior === "graduated") {
			return <MutedCell>tiered</MutedCell>;
		}
		const meta = metaOf<RateTableMeta, RateRow>(table);
		return (
			<CreditNumberInput
				variant="headless"
				ariaLabel={`${label} credit cost`}
				placeholder={inherited}
				value={rate.dimension?.credit_amount}
				onValueChange={(credits) => meta.onCreditsChange(index, credits)}
				onClear={() => meta.onCreditsChange(index, undefined)}
				className="text-sm"
			/>
		);
	},
};

interface CreditDimensionRateTableProps {
	values: DimensionValues;
	rows: CreditRateRow[];
	inheritedCredits: (match: CreditMatch) => string;
	rateWarnings: Map<string, string>;
	baseRate: string;
	onMatchChange: (index: number, match: CreditMatch) => void;
	onCreditsChange: (index: number, credits: number | undefined) => void;
	onRemove: (index: number) => void;
	onAdd: () => void;
	missingCombinationCount: number;
	onFillCombinations: () => void;
}

/** One select per dimension and a credits column; the strip beneath adds a row and names the fallback.
 * Cells are components to the table, so `data` and `columns` must stay referentially
 * stable while typing: values and handlers ride on `meta`. */
export function CreditDimensionRateTable({
	values,
	rows,
	inheritedCredits,
	rateWarnings,
	baseRate,
	onMatchChange,
	onCreditsChange,
	onRemove,
	onAdd,
	missingCombinationCount,
	onFillCombinations,
}: CreditDimensionRateTableProps) {
	const data: RateRow[] = useMemo(
		() =>
			rows.map((rate, index) => ({
				id: String(index),
				index,
				label: rowLabel(rate),
				match: rate.match,
				rate,
				inherited: inheritedCredits(rate.match),
				warning: rateWarnings.get(rate.name),
			})),
		[rows, inheritedCredits, rateWarnings],
	);

	const fields = Object.keys(values);
	const columns = useMemo(
		() => [
			...matchColumns<RateRow>(fields),
			creditsColumn,
			removeColumn<RateRow>(),
		],
		[fields.join(",")],
	);

	const meta: RateTableMeta = {
		values,
		onMatchChange,
		onRemove,
		onCreditsChange,
	};
	const table = useProductTable({
		data,
		columns,
		options: { getRowId: (row) => row.id, meta },
	});

	return (
		<CreditEditableTable
			title="Rates"
			hint="Credits per combination. The most specific match wins; a blank cost inherits the one shown."
			action={
				missingCombinationCount > 0 &&
				missingCombinationCount <= MAX_FILLED_COMBINATIONS && (
					<IconButton
						type="button"
						variant="muted"
						size="sm"
						className="text-tertiary-foreground text-xs"
						icon={<GridFourIcon size={12} />}
						onClick={onFillCombinations}
					>
						Fill {missingCombinationCount} combinations
					</IconButton>
				)
			}
			table={table}
			columnCount={columns.length}
			footer={
				<>
					<button
						type="button"
						onClick={onAdd}
						className="flex items-center gap-1 flex-1 hover:text-foreground transition-colors"
					>
						<PlusIcon className="h-3 w-3" />
						New rate
					</button>
					<span className="shrink-0 text-tertiary-foreground">
						anything else · {baseRate}
					</span>
				</>
			}
		/>
	);
}
