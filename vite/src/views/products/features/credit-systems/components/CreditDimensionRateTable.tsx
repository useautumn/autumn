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
	removeColumn,
	tableMeta,
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
					tableMeta<RateTableMeta, RateRow>(table).onPriorityChange(index, next)
				}
				onClear={() =>
					tableMeta<RateTableMeta, RateRow>(table).onPriorityChange(
						index,
						undefined,
					)
				}
				className="text-sm placeholder:text-tertiary-foreground"
			/>
		);
	},
};

const effectiveColumn: ColumnDef<RateRow, unknown> = {
	header: "Effective",
	id: "effective",
	size: 90,
	cell: ({ row }: MatchCellContext<RateRow>) => (
		<MutedCell>{row.original.effective}</MutedCell>
	),
};

const creditsColumn: ColumnDef<RateRow, unknown> = {
	header: "Credits",
	id: "credits",
	size: 90,
	cell: ({ row, table }: MatchCellContext<RateRow>) => {
		const { rate, index, label, inherited } = row.original;
		if (rate.dimension?.tier_behavior === "graduated") {
			return <MutedCell>tiered</MutedCell>;
		}
		const meta = tableMeta<RateTableMeta, RateRow>(table);
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
