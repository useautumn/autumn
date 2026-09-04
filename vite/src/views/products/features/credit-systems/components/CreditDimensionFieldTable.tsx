import { IconButton } from "@autumn/ui";
import { HashIcon, PlusIcon } from "@phosphor-icons/react";
import type {
	ColumnDef,
	Row,
	Table as TableInstance,
} from "@tanstack/react-table";
import { useMemo } from "react";
import { RemoveButton } from "@/components/v2/rule-builder/RemoveButton";
import { ValueChipInput } from "@/components/v2/rule-builder/ValueChipInput";
import { useProductTable } from "@/views/products/hooks/useProductTable";
import { useCreditDimensions } from "../hooks/CreditDimensionContext";
import { CreditDimensionNameInput } from "./CreditDimensionNameInput";
import { CreditEditableTable } from "./CreditEditableTable";

interface FieldTableRow {
	id: string;
	field: string;
	values: string[];
}

interface FieldTableMeta {
	onAddValue: (field: string, value: string) => void;
	onRemoveValue: (field: string, value: string) => void;
	onRemoveField: (field: string) => void;
	onRemoveUnnamedField: () => void;
	onRenameField: (from: string, to: string) => void;
	fields: string[];
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
		cell: ({ row, table }: FieldCellContext) => (
			<span className="flex items-center gap-1.5 min-w-0">
				<HashIcon size={14} className="shrink-0 text-tertiary-foreground" />
				<CreditDimensionNameInput
					field={row.original.field}
					onRename={(to) => metaOf(table).onRenameField(row.original.field, to)}
					isTaken={(name) =>
						name !== row.original.field && metaOf(table).fields.includes(name)
					}
				/>
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
					onClick={() => {
						const meta = metaOf(table);
						if (row.original.field === "") return meta.onRemoveUnnamedField();
						meta.onRemoveField(row.original.field);
					}}
				/>
			</div>
		),
	},
];

/** One row per dimension; the name is editable and its values are chips that wrap within the cell. */
export function CreditDimensionFieldTable() {
	const {
		values,
		unnamedFields,
		addField,
		removeField,
		removeUnnamedField,
		renameField,
		addValue,
		removeValue,
	} = useCreditDimensions();

	const data: FieldTableRow[] = useMemo(
		() => [
			...Object.entries(values).map(([field, fieldValues]) => ({
				id: `field:${field}`,
				field,
				values: fieldValues,
			})),
			...Array.from({ length: unnamedFields }, (_, index) => ({
				id: `unnamed:${index}`,
				field: "",
				values: [],
			})),
		],
		[values, unnamedFields],
	);

	const meta: FieldTableMeta = {
		onAddValue: addValue,
		onRemoveValue: removeValue,
		onRemoveField: removeField,
		onRemoveUnnamedField: removeUnnamedField,
		onRenameField: renameField,
		fields: Object.keys(values),
	};
	const table = useProductTable({
		data,
		columns: COLUMNS,
		options: { getRowId: (row) => row.id, meta },
	});

	return (
		<CreditEditableTable
			title="Dimensions"
			hint="Request properties that change the rate, and the values they take."
			table={table}
			columnCount={COLUMNS.length}
			footer={
				<IconButton
					type="button"
					variant="muted"
					size="sm"
					className="w-full text-tertiary-foreground text-xs"
					icon={<PlusIcon className="h-3 w-3" />}
					onClick={addField}
				>
					New dimension
				</IconButton>
			}
		/>
	);
}
