import type { ColumnDef } from "@tanstack/react-table";
import { PlusIcon } from "lucide-react";
import { useMemo } from "react";
import { useProductTable } from "@/views/products/hooks/useProductTable";
import type {
	CreditMatch,
	CreditRateRule,
	DimensionValues,
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
	rule: CreditRateRule;
}

interface RateTableMeta extends MatchTableMeta {
	onRuleChange: (index: number, rule: CreditRateRule) => void;
}

const ruleLabel = (rule: { name: string }) => rule.name || "new rate";

const creditsColumn: ColumnDef<RateRow, unknown> = {
	header: "Credits",
	id: "credits",
	size: 90,
	cell: ({ row, table }: MatchCellContext<RateRow>) => {
		const { rule, index, label } = row.original;
		const { dimension } = rule;
		if (dimension.tier_behavior === "graduated") {
			return <MutedCell>tiered</MutedCell>;
		}
		return (
			<CreditNumberInput
				variant="headless"
				ariaLabel={`${label} credit cost`}
				placeholder="0"
				value={dimension.credit_amount}
				onValueChange={(credit_amount) =>
					metaOf<RateTableMeta, RateRow>(table).onRuleChange(index, {
						...rule,
						dimension: { ...dimension, credit_amount },
					})
				}
				className="text-sm"
			/>
		);
	},
};

interface CreditDimensionRateTableProps {
	values: DimensionValues;
	rules: CreditRateRule[];
	baseRate: string;
	onRuleChange: (index: number, rule: CreditRateRule) => void;
	onRuleRemove: (index: number) => void;
	onRuleAdd: () => void;
}

/** One select per dimension and a credits column; the strip beneath adds a rate and names the fallback.
 * Cells are components to the table, so `data` and `columns` must stay referentially
 * stable while typing: values and handlers ride on `meta`. */
export function CreditDimensionRateTable({
	values,
	rules,
	baseRate,
	onRuleChange,
	onRuleRemove,
	onRuleAdd,
}: CreditDimensionRateTableProps) {
	const data: RateRow[] = useMemo(
		() =>
			rules.map((rule, index) => ({
				id: String(index),
				index,
				label: ruleLabel(rule),
				match: rule.dimension.match,
				rule,
			})),
		[rules],
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

	const withMatch = (index: number, match: CreditMatch) => {
		const rule = rules[index];
		onRuleChange(index, {
			...rule,
			dimension: { ...rule.dimension, match },
		});
	};
	const meta: RateTableMeta = {
		values,
		onMatchChange: withMatch,
		onRemove: onRuleRemove,
		onRuleChange,
	};
	const table = useProductTable({
		data,
		columns,
		options: { getRowId: (row) => row.id, meta },
	});

	return (
		<CreditEditableTable
			title="Rates"
			hint="Credits per combination. The most specific match wins; anything else costs the base rate."
			table={table}
			columnCount={columns.length}
			footer={
				<>
					<button
						type="button"
						onClick={onRuleAdd}
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
