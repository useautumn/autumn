import type { CreditSchemaItem } from "@autumn/shared";
import { IconButton } from "@autumn/ui";
import type {
	ColumnDef,
	Row,
	Table as TableInstance,
} from "@tanstack/react-table";
import { PlusIcon, X } from "lucide-react";
import { useMemo } from "react";
import { useProductTable } from "@/views/products/hooks/useProductTable";
import {
	type CreditRateRule,
	type DimensionValues,
	setRuleCell,
} from "../utils/creditDimensionUtils";
import { CreditDimensionValueSelect } from "./CreditDimensionValueSelect";
import { CreditEditableTable } from "./CreditEditableTable";
import { CreditNumberInput } from "./CreditNumberInput";

interface RateTableRow {
	id: string;
	index: number;
	rule?: CreditRateRule;
	base?: CreditSchemaItem;
}

interface RateTableMeta {
	values: DimensionValues;
	onRuleChange: (index: number, rule: CreditRateRule) => void;
	onRuleRemove: (index: number) => void;
	onBaseCreditsChange: (credit_amount: number) => void;
}

interface RateCellContext {
	row: Row<RateTableRow>;
	table: TableInstance<RateTableRow>;
}

const metaOf = (table: TableInstance<RateTableRow>): RateTableMeta =>
	table.options.meta as RateTableMeta;

interface CreditDimensionRateTableProps {
	values: DimensionValues;
	rules: CreditRateRule[];
	base: CreditSchemaItem;
	onRuleChange: (index: number, rule: CreditRateRule) => void;
	onRuleRemove: (index: number) => void;
	onRuleAdd: () => void;
	onBaseCreditsChange: (credit_amount: number) => void;
}

/** One column per dimension, a credits column, and a final "any" row that is the item's own rate.
 * Cells are components to the table, so `data` and `columns` must stay referentially
 * stable while typing: values and handlers ride on `meta`, the base item on its row. */
export function CreditDimensionRateTable({
	values,
	rules,
	base,
	onRuleChange,
	onRuleRemove,
	onRuleAdd,
	onBaseCreditsChange,
}: CreditDimensionRateTableProps) {
	const data: RateTableRow[] = useMemo(
		() => [
			...rules.map((rule, index) => ({ id: String(index), index, rule })),
			{ id: "base", index: rules.length, base },
		],
		[rules, base],
	);

	const fields = Object.keys(values);
	const columns: ColumnDef<RateTableRow, unknown>[] = useMemo(
		() => [
			...fields.map(
				(field): ColumnDef<RateTableRow, unknown> => ({
					header: field,
					id: `field:${field}`,
					cell: ({ row, table }: RateCellContext) => {
						const { rule, index } = row.original;
						if (!rule) return <MutedCell>any</MutedCell>;
						return (
							<CreditDimensionValueSelect
								ariaLabel={`${rule.name || "new rate"} ${field}`}
								values={metaOf(table).values[field] ?? []}
								value={rule.dimension.match[field]}
								onValueChange={(value) =>
									metaOf(table).onRuleChange(
										index,
										setRuleCell({ rule, field, value }),
									)
								}
							/>
						);
					},
				}),
			),
			{
				header: "Credits",
				id: "credits",
				size: 90,
				cell: ({ row, table }: RateCellContext) => {
					const { rule, index, base } = row.original;
					const rate = rule?.dimension ?? base;
					if (!rate) return null;
					if (rate.tier_behavior === "graduated") {
						return <MutedCell>tiered</MutedCell>;
					}
					const onCreditsChange = (credit_amount: number) => {
						if (!rule) return metaOf(table).onBaseCreditsChange(credit_amount);
						const { dimension } = rule;
						if (dimension.tier_behavior === "graduated") return;
						metaOf(table).onRuleChange(index, {
							...rule,
							dimension: { ...dimension, credit_amount },
						});
					};
					return (
						<CreditNumberInput
							variant="headless"
							ariaLabel={`${rule?.name || (rule ? "new rate" : "base rate")} credit cost`}
							placeholder="0"
							value={rate.credit_amount}
							onValueChange={onCreditsChange}
							className="text-sm"
						/>
					);
				},
			},
			{
				header: "",
				id: "actions",
				size: 40,
				enableSorting: false,
				cell: ({ row, table }: RateCellContext) => {
					const { rule, index } = row.original;
					if (!rule) return null;
					return (
						<div className="flex justify-end">
							<IconButton
								aria-label={`Remove ${rule.name || "new rate"}`}
								variant="skeleton"
								iconOrientation="center"
								icon={<X className="h-3.5 w-3.5" />}
								onClick={() => metaOf(table).onRuleRemove(index)}
								className="!text-subtle hover:!text-foreground"
							/>
						</div>
					);
				},
			},
		],
		[fields.join(",")],
	);

	const meta: RateTableMeta = {
		values,
		onRuleChange,
		onRuleRemove,
		onBaseCreditsChange,
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
				<button
					type="button"
					onClick={onRuleAdd}
					className="flex items-center gap-1 w-full hover:text-foreground transition-colors"
				>
					<PlusIcon className="h-3 w-3" />
					New rate
				</button>
			}
		/>
	);
}

function MutedCell({ children }: { children: string }) {
	return (
		<span className="text-sm text-subtle select-none tabular-nums">
			{children}
		</span>
	);
}
