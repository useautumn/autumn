import { IconButton } from "@autumn/ui";
import { ArrowElbowDownRightIcon, GridFourIcon } from "@phosphor-icons/react";
import type { ColumnDef } from "@tanstack/react-table";
import { PlusIcon } from "lucide-react";
import { useMemo } from "react";
import { useProductTable } from "@/views/products/hooks/useProductTable";
import { useCreditDimensions } from "../hooks/CreditDimensionContext";
import {
	type CreditRateRow,
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
	effective: string;
}

interface RateTableMeta extends MatchTableMeta {
	onCreditsChange: (index: number, credits: number | undefined) => void;
}

const rowLabel = (row: CreditRateRow) => row.name || "new rate";

/** What a matching track actually costs once multipliers stack on the rate. */
const effectiveColumn: ColumnDef<RateRow, unknown> = {
	header: "Effective",
	id: "effective",
	size: 90,
	cell: ({ row }: MatchCellContext<RateRow>) => (
		<MutedCell>{row.original.effective}</MutedCell>
	),
};

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

/** One select per dimension and a credits column; the strip beneath adds a row and names the fallback.
 * Cells are components to the table, so `data` and `columns` must stay referentially
 * stable while typing: values and handlers ride on `meta`. */
export function CreditDimensionRateTable({ baseRate }: { baseRate: string }) {
	const {
		values,
		rows,
		inheritedCredits,
		effectiveCredits,
		hasMultipliers,
		rateWarnings,
		setRowMatch,
		setRowCredits,
		removeRow,
		addRow,
		missingCombinationCount,
		fillCombinations,
	} = useCreditDimensions();

	const data: RateRow[] = useMemo(
		() =>
			rows.map((rate, index) => ({
				// Keyed by match, not name: typing a cost turns a draft into a named
				// rule, and a changing id would remount the row mid-keystroke.
				id: JSON.stringify(rate.match),
				index,
				label: rowLabel(rate),
				match: rate.match,
				rate,
				inherited: inheritedCredits(rate.match),
				effective: effectiveCredits(rate),
				warning: rateWarnings.get(rate.name),
			})),
		[rows, inheritedCredits, effectiveCredits, rateWarnings],
	);

	const fields = Object.keys(values);
	const columns = useMemo(
		() => [
			...matchColumns<RateRow>(fields),
			creditsColumn,
			...(hasMultipliers ? [effectiveColumn] : []),
			removeColumn<RateRow>(),
		],
		[JSON.stringify(fields), hasMultipliers],
	);

	const meta: RateTableMeta = {
		values,
		onMatchChange: setRowMatch,
		onRemove: removeRow,
		onCreditsChange: setRowCredits,
	};
	const table = useProductTable({
		data,
		columns,
		options: { getRowId: (row) => row.id, meta },
	});

	if (fields.length === 0) return null;

	return (
		<CreditEditableTable
			title="Rates"
			hint="What an event costs, before multipliers. Only one rate applies — the most specific match wins."
			action={
				missingCombinationCount > 0 &&
				missingCombinationCount <= MAX_FILLED_COMBINATIONS && (
					<IconButton
						type="button"
						variant="muted"
						size="sm"
						className="text-tertiary-foreground text-xs"
						icon={<GridFourIcon size={12} />}
						onClick={fillCombinations}
					>
						Fill {missingCombinationCount} combinations
					</IconButton>
				)
			}
			table={table}
			columnCount={columns.length}
			footer={
				<div className="flex items-center gap-2">
					<IconButton
						type="button"
						variant="muted"
						size="sm"
						className="w-full text-tertiary-foreground text-xs"
						icon={<PlusIcon className="h-3 w-3" />}
						onClick={addRow}
					>
						New rate
					</IconButton>
					<span className="flex shrink-0 items-center gap-1 text-xs text-tertiary-foreground">
						<ArrowElbowDownRightIcon size={12} />
						Empty values default to {baseRate}
					</span>
				</div>
			}
		/>
	);
}
