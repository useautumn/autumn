import { joinModelId } from "@autumn/shared";
import { IconButton } from "@autumn/ui";
import type { ColumnDef, Row } from "@tanstack/react-table";
import { X } from "lucide-react";
import { useAiProviderTable } from "../hooks/AiProviderTableContext";
import { useProviderMarkup } from "../hooks/useProviderMarkup";
import { AiModelSelectDropdown } from "./AiModelSelectDropdown";
import { CustomModelInput } from "./CustomModelInput";
import { EditableNumberCell } from "./EditableNumberCell";

export interface ModelRow {
	fullId: string;
	modelKey: string;
}

const formatCost = (value: number | null | undefined) =>
	value == null ? "–" : value.toFixed(2);

const ReadOnlyCost = ({ value }: { value: number | null | undefined }) => (
	<span className="tabular-nums text-sm text-subtle cursor-not-allowed select-none">
		{formatCost(value)}
	</span>
);

function ModelCell({ row }: { row: Row<ModelRow> }) {
	const { provider, providerKey, isCustom, isLoading, renameKey } =
		useAiProviderTable();
	const { modelKey } = row.original;
	const rename = (newKey: string) =>
		renameKey(
			joinModelId(providerKey, modelKey),
			joinModelId(providerKey, newKey),
		);

	if (isCustom) {
		return <CustomModelInput modelKey={modelKey} onRename={rename} />;
	}

	return (
		<AiModelSelectDropdown
			value={modelKey}
			onValueChange={rename}
			provider={provider}
			isLoading={isLoading}
		/>
	);
}

function CostCell({
	row,
	field,
}: {
	row: Row<ModelRow>;
	field: "input_cost" | "output_cost";
}) {
	const { form, provider, isCustom } = useAiProviderTable();
	const { fullId, modelKey } = row.original;

	if (isCustom) {
		return <EditableNumberCell form={form} fullId={fullId} field={field} />;
	}

	const cost = provider.models[modelKey]?.cost;
	return (
		<ReadOnlyCost value={field === "input_cost" ? cost?.input : cost?.output} />
	);
}

function MarkupCell({ row }: { row: Row<ModelRow> }) {
	const { form, providerKey } = useAiProviderTable();
	const { inheritedMarkup } = useProviderMarkup(form, providerKey);

	return (
		<EditableNumberCell
			form={form}
			fullId={row.original.fullId}
			field="markup"
			useDefaultAsPlaceholder
			inheritedPlaceholder={inheritedMarkup}
			allowUndefined
		/>
	);
}

function RemoveCell({ row }: { row: Row<ModelRow> }) {
	const { removeKeys } = useAiProviderTable();

	return (
		<div className="flex justify-end" onClick={(e) => e.stopPropagation()}>
			<IconButton
				variant="skeleton"
				iconOrientation="center"
				aria-label="Remove model"
				icon={<X className="h-3.5 w-3.5" />}
				onClick={() => removeKeys([row.original.fullId])}
				className="!text-subtle hover:!text-foreground"
			/>
		</div>
	);
}

/** Headers differ between the custom and models.dev tables; nothing else does. */
const CustomModelHeader = () => {
	const { isCustom } = useAiProviderTable();
	return <>{isCustom ? "In $/M" : "Input"}</>;
};

const OutputHeader = () => {
	const { isCustom } = useAiProviderTable();
	return <>{isCustom ? "Out $/M" : "Output"}</>;
};

/**
 * Constant column definitions. Every cell reads the table's context rather than
 * closing over props, so this array never has to be rebuilt — which is what
 * keeps focus in the inputs while typing.
 */
export const AI_RATE_TABLE_COLUMNS: ColumnDef<ModelRow, unknown>[] = [
	{ header: "Model", accessorKey: "modelKey", size: 200, cell: ModelCell },
	{
		header: CustomModelHeader,
		id: "inputCost",
		size: 80,
		cell: ({ row }) => <CostCell row={row} field="input_cost" />,
	},
	{
		header: OutputHeader,
		id: "outputCost",
		size: 80,
		cell: ({ row }) => <CostCell row={row} field="output_cost" />,
	},
	{ header: "Markup %", id: "markup", size: 80, cell: MarkupCell },
	{
		header: "",
		accessorKey: "actions",
		size: 40,
		enableSorting: false,
		cell: RemoveCell,
	},
];
