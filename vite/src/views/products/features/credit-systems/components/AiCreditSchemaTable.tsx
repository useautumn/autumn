import {
	joinModelId,
	type ModelsDevProvider,
	splitModelId,
} from "@autumn/shared";
import type { ColumnDef, Row } from "@tanstack/react-table";
import { InfoIcon, PlusIcon, X } from "lucide-react";
import { useMemo } from "react";
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
import { useProviderMarkup } from "../hooks/useProviderMarkup";
import { addCustomModelMarkup } from "../utils/modelMarkupUtils";
import { AiModelSelectDropdown } from "./AiModelSelectDropdown";
import { CustomModelInput } from "./CustomModelInput";
import { EditableNumberCell } from "./EditableNumberCell";

interface ModelRow {
	fullId: string;
	modelKey: string;
}

function MarkupCell({
	form,
	fullId,
	providerKey,
}: {
	form: CreditSystemFormInstance;
	fullId: string;
	providerKey: string;
}) {
	const { inheritedMarkup } = useProviderMarkup(form, providerKey);

	return (
		<EditableNumberCell
			form={form}
			fullId={fullId}
			field="markup"
			useDefaultAsPlaceholder
			inheritedPlaceholder={inheritedMarkup}
			allowUndefined
		/>
	);
}

interface AiCreditSchemaTableProps {
	form: CreditSystemFormInstance;
	providerKey: string;
	providerName: string;
	modelFullIds: string[];
	provider: ModelsDevProvider;
	isLoading: boolean;
	removeKeys: (keys: string[]) => void;
	removeProvider: (providerKey: string) => void;
	setProviderMarkup: (providerKey: string, value: number | undefined) => void;
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
	removeProvider,
	setProviderMarkup,
	renameKey,
}: AiCreditSchemaTableProps) {
	const isCustom = providerKey === "custom";

	const { defaultMarkup, providerMarkup } = useProviderMarkup(
		form,
		providerKey,
	);

	const data: ModelRow[] = useMemo(
		() =>
			modelFullIds.map((fullId) => ({
				fullId,
				modelKey: splitModelId(fullId).modelKey,
			})),
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
									renameKey(
										joinModelId(providerKey, modelKey),
										joinModelId(providerKey, newKey),
									)
								}
							/>
						);
					}
					return (
						<AiModelSelectDropdown
							value={modelKey}
							onValueChange={(newKey) =>
								renameKey(
									joinModelId(providerKey, modelKey),
									joinModelId(providerKey, newKey),
								)
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
					<MarkupCell
						form={form}
						fullId={row.original.fullId}
						providerKey={providerKey}
					/>
				),
			},
			{
				header: "",
				accessorKey: "actions",
				size: 40,
				enableSorting: false,
				cell: ({ row }: { row: Row<ModelRow> }) => (
					<div
						className="flex justify-end"
						onClick={(e) => e.stopPropagation()}
					>
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
								Use format{" "}
								<code className="text-[11px] bg-muted px-1 py-0.5 rounded">
									custom/modelId
								</code>{" "}
								in API tracking
							</TooltipContent>
						</Tooltip>
					)}
				</span>
				<div className="flex items-center gap-2">
					{!isCustom && (
						<div className="flex items-center gap-1.5">
							<span className="text-xs text-subtle">Markup %</span>
							<Input
								type="text"
								inputMode="numeric"
								value={providerMarkup == null ? "" : String(providerMarkup)}
								onChange={(e) => {
									const raw = e.target.value;
									if (raw === "" || /^-?\d*\.?\d*$/.test(raw)) {
										if (raw === "") {
											setProviderMarkup(providerKey, undefined);
										} else {
											const parsed = Number(raw);
											if (!Number.isNaN(parsed)) {
												setProviderMarkup(providerKey, parsed);
											}
										}
									}
								}}
								placeholder={String(defaultMarkup)}
								className="w-20"
							/>
						</div>
					)}
					<IconButton
						variant="skeleton"
						iconOrientation="center"
						icon={<X className="h-3.5 w-3.5" />}
						onClick={() => removeProvider(providerKey)}
						className="!text-subtle hover:!text-foreground"
					/>
				</div>
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
									return addCustomModelMarkup(prev);
								}
								const usedKeys = new Set(
									Object.keys(prev)
										.filter((k) => splitModelId(k).provider === providerKey)
										.map((k) => splitModelId(k).modelKey),
								);
								const nextKey = Object.keys(provider.models).find(
									(k) => !usedKeys.has(k),
								);
								if (!nextKey) return prev;
								return { ...prev, [joinModelId(providerKey, nextKey)]: {} };
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
