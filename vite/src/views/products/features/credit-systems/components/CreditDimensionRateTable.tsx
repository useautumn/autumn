import { IconButton } from "@autumn/ui";
import { GridFourIcon } from "@phosphor-icons/react";
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
	priority: number | undefined;
}

interface RateTableMeta extends MatchTableMeta {
	onCreditsChange: (index: number, credits: number | undefined) => void;
	onPriorityChange: (index: number, priority: number | undefined) => void;
}

const rowLabel = (row: CreditRateRow) => row.name || "new rate";

/**
 * Which row wins when several match the same event: highest priority takes it,
 * and a blank ranks below any number. Only relevant when rows tie, so the
 * column is hidden until one does.
 */
const priorityColumn: ColumnDef<RateRow, unknown> = {
	header: "Priority",
	id: "priority",
	size: 80,
	cell: ({ row, table }: MatchCellContext<RateRow>) => {
		const { index, label, priority, rate } = row.original;
		if (!rate.dimension) return null;
		return (
			<CreditNumberInput
				variant="headless"
				ariaLabel={`${label} priority`}
				placeholder="—"
				value={priority}
				onValueChange={(next) =>
					metaOf<RateTableMeta, RateRow>(table).onPriorityChange(index, next)
				}
				onClear={() =>
					metaOf<RateTableMeta, RateRow>(table).onPriorityChange(
						index,
						undefined,
					)
				}
				className="text-sm placeholder:text-tertiary-foreground"
			/>
		);
	},
};

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
export function CreditDimensionRateTable() {
	const {
		values,
		rows,
		inheritedCredits,
		effectiveCredits,
		hasMultipliers,
		rateWarnings,
		showPriority,
		setRowPriority,
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
				id: rate.key,
				index,
				label: rowLabel(rate),
				match: rate.match,
				rate,
				inherited: inheritedCredits(rate.match),
				effective: effectiveCredits(rate),
				priority: rate.dimension?.priority,
				warning: rateWarnings.get(rate.name),
			})),
		[rows, inheritedCredits, effectiveCredits, rateWarnings],
	);

	const fields = Object.keys(values);
	const columns = useMemo(
		() => [
			...matchColumns<RateRow>(fields),
			creditsColumn,
			...(showPriority ? [priorityColumn] : []),
			...(hasMultipliers ? [effectiveColumn] : []),
			removeColumn<RateRow>(),
		],
		[JSON.stringify(fields), hasMultipliers, showPriority],
	);

	const meta: RateTableMeta = {
		values,
		onMatchChange: setRowMatch,
		onRemove: removeRow,
		onCreditsChange: setRowCredits,
		onPriorityChange: setRowPriority,
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
			hint="What an event costs, before multipliers. Only one rate applies — the most specific match wins, then the highest priority."
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
			}
		/>
	);
}
