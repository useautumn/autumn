import { IconButton, Input } from "@autumn/ui";
import type { ColumnDef, Row } from "@tanstack/react-table";
import { PlusIcon, X } from "lucide-react";
import { useMemo } from "react";
import { Table } from "@/components/general/table";
import { useProductTable } from "@/views/products/hooks/useProductTable";
import {
	type CreditRateRule,
	setRuleCell,
} from "../utils/creditDimensionUtils";
import { CreditNumberInput } from "./CreditNumberInput";

interface RateTableRow {
	id: string;
	index: number;
	rule?: CreditRateRule;
}

interface CreditDimensionRateTableProps {
	fields: string[];
	rules: CreditRateRule[];
	baseRate: string;
	onRuleChange: (index: number, rule: CreditRateRule) => void;
	onRuleRemove: (index: number) => void;
	onRuleAdd: () => void;
}

/** One column per dimension, a credits column, and a final row for the row's own rate. */
export function CreditDimensionRateTable({
	fields,
	rules,
	baseRate,
	onRuleChange,
	onRuleRemove,
	onRuleAdd,
}: CreditDimensionRateTableProps) {
	const data: RateTableRow[] = [
		...rules.map((rule, index) => ({ id: String(index), index, rule })),
		{ id: "base", index: rules.length },
	];

	const columns: ColumnDef<RateTableRow, unknown>[] = useMemo(
		() => [
			...fields.map(
				(field): ColumnDef<RateTableRow, unknown> => ({
					header: field,
					id: `field:${field}`,
					cell: ({ row }: { row: Row<RateTableRow> }) => {
						const { rule, index } = row.original;
						if (!rule) return <MutedCell>any</MutedCell>;
						return (
							<Input
								variant="headless"
								aria-label={`${rule.name || "new rate"} ${field}`}
								placeholder="any"
								value={rule.dimension.match[field] ?? ""}
								onChange={(event) =>
									onRuleChange(
										index,
										setRuleCell({ rule, field, value: event.target.value }),
									)
								}
								className="text-sm"
							/>
						);
					},
				}),
			),
			{
				header: "Credits",
				id: "credits",
				size: 90,
				cell: ({ row }: { row: Row<RateTableRow> }) => {
					const { rule, index } = row.original;
					if (!rule) return <MutedCell>{baseRate}</MutedCell>;
					const { dimension } = rule;
					if (dimension.tier_behavior === "graduated") {
						return <MutedCell>tiered</MutedCell>;
					}
					return (
						<CreditNumberInput
							variant="headless"
							ariaLabel={`${rule.name || "new rate"} credit cost`}
							placeholder="0"
							value={dimension.credit_amount}
							onValueChange={(credit_amount) =>
								onRuleChange(index, {
									...rule,
									dimension: { ...dimension, credit_amount },
								})
							}
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
				cell: ({ row }: { row: Row<RateTableRow> }) => {
					const { rule, index } = row.original;
					if (!rule) return null;
					return (
						<div className="flex justify-end">
							<IconButton
								aria-label={`Remove ${rule.name || "new rate"}`}
								variant="skeleton"
								iconOrientation="center"
								icon={<X className="h-3.5 w-3.5" />}
								onClick={() => onRuleRemove(index)}
								className="!text-subtle hover:!text-foreground"
							/>
						</div>
					);
				},
			},
		],
		[fields.join(","), baseRate, onRuleChange, onRuleRemove],
	);

	const table = useProductTable({
		data,
		columns,
		options: { getRowId: (row) => row.id },
	});

	return (
		<div className="rounded-lg border shadow-card overflow-hidden">
			<Table.Provider
				config={{
					table,
					numberOfColumns: columns.length,
					isLoading: false,
					enableSorting: false,
					rowClassName: "h-10",
					flexibleTableColumns: true,
				}}
			>
				<Table.Container>
					<Table.Content className="!rounded-none !border-0 !shadow-none">
						<Table.Header />
						<Table.Body />
					</Table.Content>
				</Table.Container>
			</Table.Provider>

			<button
				type="button"
				onClick={onRuleAdd}
				className="flex items-center gap-1 w-full px-4 py-1.5 text-xs text-muted-foreground hover:text-foreground bg-interactive-secondary border-t border-border transition-colors"
			>
				<PlusIcon className="h-3 w-3" />
				New rate
			</button>
		</div>
	);
}

function MutedCell({ children }: { children: string }) {
	return (
		<span className="text-sm text-subtle select-none tabular-nums">
			{children}
		</span>
	);
}
