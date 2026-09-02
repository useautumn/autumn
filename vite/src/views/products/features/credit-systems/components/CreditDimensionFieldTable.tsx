import { Input } from "@autumn/ui";
import { HashIcon, PlusIcon } from "@phosphor-icons/react";
import type {
	ColumnDef,
	Row,
	Table as TableInstance,
} from "@tanstack/react-table";
import { useMemo } from "react";
import { RemoveButton } from "@/components/v2/rule-builder/RemoveButton";
import { useDraftValue } from "@/components/v2/rule-builder/useDraftValue";
import { ValueChipInput } from "@/components/v2/rule-builder/ValueChipInput";
import { useProductTable } from "@/views/products/hooks/useProductTable";
import type { DimensionValues } from "../utils/creditDimensionUtils";
import { CreditEditableTable } from "./CreditEditableTable";

interface FieldTableRow {
	field: string;
	values: string[];
}

interface FieldTableMeta {
	onAddValue: (field: string, value: string) => void;
	onRemoveValue: (field: string, value: string) => void;
	onRemoveField: (field: string) => void;
}

interface FieldCellContext {
	row: Row<FieldTableRow>;
	table: TableInstance<FieldTableRow>;
}

const metaOf = (table: TableInstance<FieldTableRow>): FieldTableMeta =>
	table.options.meta as FieldTableMeta;

const COLUMNS: ColumnDef<FieldTableRow, unknown>[] = [
	{
		header: "Dimension",
		id: "field",
		size: 160,
		cell: ({ row }: FieldCellContext) => (
			<span className="flex items-center gap-1.5 min-w-0">
				<HashIcon size={14} className="shrink-0 text-tertiary-foreground" />
				<span className="text-sm truncate">{row.original.field}</span>
			</span>
		),
	},
	{
		header: "Values",
		id: "values",
		cell: ({ row, table }: FieldCellContext) => {
			const { field, values } = row.original;
			return (
				<ValueChipInput
					aria-label={`${field} values`}
					className="h-auto min-h-8 py-1.5 flex-wrap gap-1 !border-0 !shadow-none !bg-transparent !rounded-none !px-0.5"
					values={values}
					onAdd={(value) => metaOf(table).onAddValue(field, value)}
					onRemove={(value) => metaOf(table).onRemoveValue(field, value)}
					placeholder="eg. small, press enter"
				/>
			);
		},
	},
	{
		header: "",
		id: "actions",
		size: 40,
		enableSorting: false,
		cell: ({ row, table }: FieldCellContext) => (
			<div className="flex justify-end">
				<RemoveButton
					className="opacity-100"
					onClick={() => metaOf(table).onRemoveField(row.original.field)}
				/>
			</div>
		),
	},
];

interface CreditDimensionFieldTableProps {
	values: DimensionValues;
	onAddField: (field: string) => void;
	onRemoveField: (field: string) => void;
	onAddValue: (field: string, value: string) => void;
	onRemoveValue: (field: string, value: string) => void;
}

/** One row per dimension; its values are chips that wrap within the cell. The strip beneath adds a dimension on enter. */
export function CreditDimensionFieldTable({
	values,
	onAddField,
	onRemoveField,
	onAddValue,
	onRemoveValue,
}: CreditDimensionFieldTableProps) {
	const data: FieldTableRow[] = useMemo(
		() =>
			Object.entries(values).map(([field, fieldValues]) => ({
				field,
				values: fieldValues,
			})),
		[values],
	);
	const newField = useDraftValue({
		onSubmit: (field) => {
			if (!(field in values)) onAddField(field);
		},
	});

	const meta: FieldTableMeta = { onAddValue, onRemoveValue, onRemoveField };
	const table = useProductTable({
		data,
		columns: COLUMNS,
		options: { getRowId: (row) => row.field, meta },
	});

	return (
		<CreditEditableTable
			title="Dimensions"
			description="Request properties that change the rate, and the values they take."
			table={table}
			columnCount={COLUMNS.length}
			footer={
				<>
					<PlusIcon className="h-3 w-3 shrink-0" />
					<Input
						{...newField.inputProps}
						variant="headless"
						aria-label="New dimension"
						className="h-auto! text-xs"
						placeholder="Add dimension, eg. size"
					/>
				</>
			}
		/>
	);
}
