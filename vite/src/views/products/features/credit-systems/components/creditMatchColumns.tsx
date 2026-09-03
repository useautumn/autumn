import { IconButton } from "@autumn/ui";
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

export const removeColumn = <T extends MatchRow>(): ColumnDef<T, unknown> => ({
	header: "",
	id: "actions",
	size: 40,
	enableSorting: false,
	cell: ({ row, table }: MatchCellContext<T>) => (
		<div className="flex justify-end">
			<IconButton
				aria-label={`Remove ${row.original.label}`}
				variant="skeleton"
				iconOrientation="center"
				icon={<X className="h-3.5 w-3.5" />}
				onClick={() => metaOf(table).onRemove(row.original.index)}
				className="!text-subtle hover:!text-foreground"
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
