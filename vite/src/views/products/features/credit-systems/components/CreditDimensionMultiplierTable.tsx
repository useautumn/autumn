import type { ColumnDef } from "@tanstack/react-table";
import { PlusIcon } from "lucide-react";
import { useMemo } from "react";
import { useProductTable } from "@/views/products/hooks/useProductTable";
import { useCreditDimensions } from "../hooks/CreditDimensionContext";
import type {
	CreditMatch,
	CreditMultiplierRule,
} from "../utils/creditDimensionUtils";
import { CreditEditableTable } from "./CreditEditableTable";
import { CreditNumberInput } from "./CreditNumberInput";
import {
	type MatchCellContext,
	type MatchRow,
	type MatchTableMeta,
	matchColumns,
	metaOf,
	removeColumn,
} from "./creditMatchColumns";

interface MultiplierRow extends MatchRow {
	rule: CreditMultiplierRule;
}

interface MultiplierTableMeta extends MatchTableMeta {
	onMultiplierChange: (index: number, rule: CreditMultiplierRule) => void;
}

const ruleLabel = (rule: { name: string }) => rule.name || "new multiplier";

const factorColumn: ColumnDef<MultiplierRow, unknown> = {
	header: "× Factor",
	id: "factor",
	size: 90,
	cell: ({ row, table }: MatchCellContext<MultiplierRow>) => {
		const { rule, index, label } = row.original;
		return (
			<CreditNumberInput
				variant="headless"
				ariaLabel={`${label} factor`}
				placeholder="1"
				value={rule.multiplier.factor}
				onClear={() =>
					metaOf<MultiplierTableMeta, MultiplierRow>(table).onMultiplierChange(
						index,
						{
							...rule,
							multiplier: { ...rule.multiplier, factor: undefined },
						},
					)
				}
				onValueChange={(factor) =>
					metaOf<MultiplierTableMeta, MultiplierRow>(table).onMultiplierChange(
						index,
						{
							...rule,
							multiplier: { ...rule.multiplier, factor },
						},
					)
				}
				className="text-sm"
			/>
		);
	},
};

/** One select per dimension and a factor column; every matching multiplier stacks on the rate. */
export function CreditDimensionMultiplierTable() {
	const {
		values,
		multipliers,
		setMultiplier,
		removeMultiplier,
		addMultiplier,
	} = useCreditDimensions();

	const data: MultiplierRow[] = useMemo(
		() =>
			multipliers.map((rule, index) => ({
				id: JSON.stringify(rule.multiplier.match),
				index,
				label: ruleLabel(rule),
				match: rule.multiplier.match,
				rule,
			})),
		[multipliers],
	);

	const fields = Object.keys(values);
	const columns = useMemo(
		() => [
			...matchColumns<MultiplierRow>(fields),
			factorColumn,
			removeColumn<MultiplierRow>(),
		],
		[JSON.stringify(fields)],
	);

	const withMatch = (index: number, match: CreditMatch) => {
		const rule = multipliers[index];
		setMultiplier(index, {
			...rule,
			multiplier: { ...rule.multiplier, match },
		});
	};
	const meta: MultiplierTableMeta = {
		values,
		onMatchChange: withMatch,
		onRemove: removeMultiplier,
		onMultiplierChange: setMultiplier,
	};
	const table = useProductTable({
		data,
		columns,
		options: { getRowId: (row) => row.id, meta },
	});

	if (fields.length === 0) return null;

	return (
		<CreditEditableTable
			title="Multipliers"
			hint="Scales the rate an event was charged. Unlike rates, every multiplier that matches applies."
			table={table}
			columnCount={columns.length}
			footer={
				<button
					type="button"
					onClick={addMultiplier}
					className="flex items-center gap-1 flex-1 hover:text-foreground transition-colors"
				>
					<PlusIcon className="h-3 w-3" />
					New multiplier
				</button>
			}
		/>
	);
}
