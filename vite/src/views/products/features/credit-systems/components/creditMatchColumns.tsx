import {
	IconButton,
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@autumn/ui";
import { WarningIcon } from "@phosphor-icons/react";
import type {
	ColumnDef,
	Row,
	Table as TableInstance,
} from "@tanstack/react-table";
import { X } from "lucide-react";
import {
	type CreditMatch,
	type DimensionValues,
	setMatchValue,
} from "../utils/creditDimensionUtils";
import { CreditDimensionValueSelect } from "./CreditDimensionValueSelect";

/** A rule row: one select per field over its match, then whatever the table adds. */
export interface MatchRow {
	id: string;
	index: number;
	label: string;
	match: CreditMatch;
	/** Set when this row and another could match the same event; the save is blocked until fixed. */
	warning?: string;
}

export interface MatchTableMeta {
	values: DimensionValues;
	onMatchChange: (index: number, match: CreditMatch) => void;
	onRemove: (index: number) => void;
}

export interface MatchCellContext<T extends MatchRow> {
	row: Row<T>;
	table: TableInstance<T>;
}

export const metaOf = <M extends MatchTableMeta, T extends MatchRow>(
	table: TableInstance<T>,
): M => table.options.meta as M;

export const matchColumns = <T extends MatchRow>(
	fields: string[],
): ColumnDef<T, unknown>[] =>
	fields.map((field) => ({
		header: field,
		id: `field:${field}`,
		cell: ({ row, table }: MatchCellContext<T>) => {
			const { label, index, match } = row.original;
			return (
				<CreditDimensionValueSelect
					ariaLabel={`${label} ${field}`}
					values={metaOf(table).values[field] ?? []}
					value={match[field]}
					onValueChange={(value) =>
						metaOf(table).onMatchChange(
							index,
							setMatchValue({ match, field, value }),
						)
					}
				/>
			);
		},
	}));

/** Wide enough for the warning glyph beside the remove button. */
const ACTIONS_COLUMN_WIDTH = 64;

export const removeColumn = <T extends MatchRow>(): ColumnDef<T, unknown> => ({
	header: "",
	id: "actions",
	size: ACTIONS_COLUMN_WIDTH,
	enableSorting: false,
	cell: ({ row, table }: MatchCellContext<T>) => (
		<div className="flex justify-end items-center gap-1">
			{row.original.warning && (
				<Tooltip>
					<TooltipTrigger asChild>
						<span className="inline-flex text-amber-600 dark:text-amber-500">
							<WarningIcon size={14} weight="fill" />
						</span>
					</TooltipTrigger>
					<TooltipContent>{row.original.warning}</TooltipContent>
				</Tooltip>
			)}
			<IconButton
				aria-label={`Remove ${row.original.label}`}
				variant="skeleton"
				iconOrientation="center"
				icon={<X className="h-3.5 w-3.5" />}
				onClick={() => metaOf(table).onRemove(row.original.index)}
				className="!text-subtle hover:!text-foreground rounded-md p-1"
			/>
		</div>
	),
});

export function MutedCell({ children }: { children: string }) {
	return (
		<span className="text-sm text-subtle select-none tabular-nums">
			{children}
		</span>
	);
}
