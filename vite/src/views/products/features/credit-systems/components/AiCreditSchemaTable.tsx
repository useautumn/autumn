import type { ModelsDevProvider } from "@autumn/shared";
import type { ColumnDef, Row } from "@tanstack/react-table";
import { useStore } from "@tanstack/react-form";
import { InfoIcon, PlusIcon, X } from "lucide-react";
import { useMemo, useState } from "react";
import { Table } from "@/components/general/table";
import { IconButton } from "@/components/v2/buttons/IconButton";
import { Input } from "@/components/v2/inputs/Input";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/v2/tooltips/Tooltip";
import { useProductTable } from "@/views/products/hooks/useProductTable";
import type { CreditSystemFormInstance } from "../hooks/useCreditSystemForm";
import { AiModelSelectDropdown } from "./AiModelSelectDropdown";

interface ModelRow {
	fullId: string;
	modelKey: string;
}

interface AiCreditSchemaTableProps {
	form: CreditSystemFormInstance;
	providerKey: string;
	providerName: string;
	modelFullIds: string[];
	provider: ModelsDevProvider;
	isLoading: boolean;
	removeKeys: (keys: string[]) => void;
	renameKey: (oldKey: string, newKey: string) => void;
}

function formatCost(value: number | null | undefined): string {
	if (value == null) return "–";
	return value.toFixed(2);
}

export function AiCreditSchemaTable({
	form,
	providerKey,
	providerName,
	modelFullIds,
	provider,
	isLoading,
	removeKeys,
	renameKey,
}: AiCreditSchemaTableProps) {
	const isCustom = providerKey === "custom";

	const data: ModelRow[] = useMemo(
		() =>
			modelFullIds.map((fullId) => {
				const [, ...parts] = fullId.split("/");
				return { fullId, modelKey: parts.join("/") };
			}),
		[modelFullIds.join(",")],
	);

	const columns: ColumnDef<ModelRow, unknown>[] = useMemo(
		() => [
			{
				header: "Model",
				accessorKey: "modelKey",
				size: 200,
				cell: ({ row }: { row: Row<ModelRow> }) => {
					const { modelKey } = row.original;
					if (isCustom) {
						return (
							<CustomModelInput
								modelKey={modelKey}
								onRename={(newKey) =>
									renameKey(`${providerKey}/${modelKey}`, `${providerKey}/${newKey}`)
								}
							/>
						);
					}
					return (
						<AiModelSelectDropdown
							value={modelKey}
							onValueChange={(newKey) =>
								renameKey(`${providerKey}/${modelKey}`, `${providerKey}/${newKey}`)
							}
							provider={provider}
							isLoading={isLoading}
						/>
					);
				},
			},
			{
				header: isCustom ? "In $/M" : "Input",
				id: "inputCost",
				size: 80,
				cell: ({ row }: { row: Row<ModelRow> }) => {
					const { fullId, modelKey } = row.original;
					if (isCustom) {
						return (
							<EditableNumberCell
								form={form}
								fullId={fullId}
								field="input_cost"
							/>
						);
					}
					const cost = provider.models[modelKey]?.cost?.input ?? null;
					return (
						<span className="tabular-nums text-sm text-subtle cursor-not-allowed select-none">
							{formatCost(cost)}
						</span>
					);
				},
			},
			{
				header: isCustom ? "Out $/M" : "Output",
				id: "outputCost",
				size: 80,
				cell: ({ row }: { row: Row<ModelRow> }) => {
					const { fullId, modelKey } = row.original;
					if (isCustom) {
						return (
							<EditableNumberCell
								form={form}
								fullId={fullId}
								field="output_cost"
							/>
						);
					}
					const cost = provider.models[modelKey]?.cost?.output ?? null;
					return (
						<span className="tabular-nums text-sm text-subtle cursor-not-allowed select-none">
							{formatCost(cost)}
						</span>
					);
				},
			},
			{
				header: "Markup %",
				id: "markup",
				size: 80,
				cell: ({ row }: { row: Row<ModelRow> }) => (
					<EditableNumberCell
						form={form}
						fullId={row.original.fullId}
						field="markup"
						useDefaultAsPlaceholder
						allowUndefined
					/>
				),
			},
			{
				header: "",
				accessorKey: "actions",
				size: 40,
				enableSorting: false,
				cell: ({ row }: { row: Row<ModelRow> }) => (
					<div className="flex justify-end" onClick={(e) => e.stopPropagation()}>
						<IconButton
							variant="skeleton"
							iconOrientation="center"
							icon={<X className="h-3.5 w-3.5" />}
							onClick={() => removeKeys([row.original.fullId])}
							className="!text-subtle hover:!text-foreground"
						/>
					</div>
				),
			},
		],
		[isCustom, provider, isLoading, providerKey, form],
	);

	const allModelsUsed =
		!isCustom && Object.keys(provider.models).length === modelFullIds.length;

	const table = useProductTable({
		data,
		columns,
		options: { getRowId: (row) => row.fullId },
	});

	return (
		<div>
			<div className="flex items-center justify-between pb-3 pr-2">
				<span className="flex items-center gap-2 text-sm font-medium text-foreground">
					{providerName}
					{!isCustom && (
						<img
							src={`https://models.dev/logos/${providerKey}.svg`}
							alt={providerName}
							className="h-4 w-4 dark:invert opacity-40"
						/>
					)}
					{isCustom && (
						<Tooltip>
							<TooltipTrigger asChild>
								<InfoIcon className="h-3.5 w-3.5 text-muted-foreground opacity-40" />
							</TooltipTrigger>
							<TooltipContent>
								Use format <code className="text-[11px] bg-muted px-1 py-0.5 rounded">custom/modelId</code> in API tracking
							</TooltipContent>
						</Tooltip>
					)}
				</span>
				<IconButton
					variant="skeleton"
					iconOrientation="center"
					icon={<X className="h-3.5 w-3.5" />}
					onClick={() => removeKeys(modelFullIds)}
					className="!text-subtle hover:!text-foreground"
				/>
			</div>

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

				{!allModelsUsed && (
					<button
						type="button"
						onClick={() =>
							form.setFieldValue("model_markups", (prev) => {
								if (isCustom) {
									const existing = Object.keys(prev).filter((k) => k.startsWith("custom/"));
									let i = 1;
									while (existing.includes(`custom/model-${i}`)) i++;
									return { ...prev, [`custom/model-${i}`]: { input_cost: 0, output_cost: 0 } };
								}
								const usedKeys = new Set(
									Object.keys(prev)
										.filter((k) => k.startsWith(`${providerKey}/`))
										.map((k) => k.slice(`${providerKey}/`.length)),
								);
								const nextKey = Object.keys(provider.models).find((k) => !usedKeys.has(k));
								if (!nextKey) return prev;
								return { ...prev, [`${providerKey}/${nextKey}`]: {} };
							})
						}
						className="flex items-center gap-1 w-full px-4 py-1.5 text-xs text-muted-foreground hover:text-foreground bg-interactive-secondary border-t border-border transition-colors"
					>
						<PlusIcon className="h-3 w-3" />
						New
					</button>
				)}
			</div>
		</div>
	);
}

function CustomModelInput({
	modelKey,
	onRename,
}: {
	modelKey: string;
	onRename: (newKey: string) => void;
}) {
	const [local, setLocal] = useState(modelKey);
	return (
		<Input
			variant="headless"
			value={local}
			onChange={(e) => setLocal(e.target.value)}
			onBlur={() => {
				if (local !== modelKey) onRename(local);
			}}
			placeholder="my-model-id"
			className="text-sm"
		/>
	);
}

function EditableNumberCell({
	form,
	fullId,
	field,
	useDefaultAsPlaceholder = false,
	allowUndefined = false,
}: {
	form: CreditSystemFormInstance;
	fullId: string;
	field: "markup" | "input_cost" | "output_cost";
	useDefaultAsPlaceholder?: boolean;
	allowUndefined?: boolean;
}) {
	const currentValue = useStore(
		form.store,
		(s) => s.values.model_markups[fullId]?.[field],
	);
	const placeholder = useStore(form.store, (s) =>
		useDefaultAsPlaceholder ? String(s.values.defaultMarkup) : "0",
	);
	const [local, setLocal] = useState("");
	const [focused, setFocused] = useState(false);

	const hasValue = allowUndefined ? currentValue != null && currentValue !== 0 : currentValue != null;
	const displayed = focused ? local : hasValue ? String(currentValue) : "";

	return (
		<Input
			variant="headless"
			type="text"
			inputMode="numeric"
			value={displayed}
			onChange={(e) => {
				const raw = e.target.value;
				if (raw === "" || /^-?\d*\.?\d*$/.test(raw)) {
					setLocal(raw);
					if (raw === "" && allowUndefined) {
						form.setFieldValue("model_markups", (prev) => {
							const entry = { ...prev[fullId] };
							delete entry[field];
							return { ...prev, [fullId]: entry };
						});
					} else if (raw !== "") {
						const parsed = Number(raw);
						if (!Number.isNaN(parsed)) {
							form.setFieldValue("model_markups", (prev) => ({
								...prev,
								[fullId]: { ...prev[fullId], [field]: parsed },
							}));
						}
					}
				}
			}}
			onFocus={() => {
				setLocal(hasValue ? String(currentValue) : "");
				setFocused(true);
			}}
			onBlur={() => {
				setFocused(false);
				if (local === "" && !allowUndefined) {
					form.setFieldValue("model_markups", (prev) => ({
						...prev,
						[fullId]: { ...prev[fullId], [field]: 0 },
					}));
				}
			}}
			placeholder={placeholder}
			className="text-sm"
		/>
	);
}
