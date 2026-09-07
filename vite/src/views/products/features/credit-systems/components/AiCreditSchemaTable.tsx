import {
	joinModelId,
	type ModelsDevProvider,
	splitModelId,
} from "@autumn/shared";
import { IconButton } from "@autumn/ui";
import { PlusIcon } from "lucide-react";
import { useMemo } from "react";
import { Table } from "@/components/general/table";
import { useProductTable } from "@/views/products/hooks/useProductTable";
import { AiProviderTableProvider } from "../hooks/AiProviderTableContext";
import type { CreditSystemFormInstance } from "../hooks/useCreditSystemForm";
import { addCustomModelMarkup } from "../utils/modelMarkupUtils";
import { AiProviderTableHeading } from "./AiProviderTableHeading";
import { AI_RATE_TABLE_COLUMNS, type ModelRow } from "./aiRateTableColumns";

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

	const data: ModelRow[] = useMemo(
		() =>
			modelFullIds.map((fullId) => ({
				fullId,
				modelKey: splitModelId(fullId).modelKey,
			})),
		[modelFullIds.join(",")],
	);

	const table = useProductTable({
		data,
		columns: AI_RATE_TABLE_COLUMNS,
		options: { getRowId: (row) => row.fullId },
	});

	const allModelsUsed =
		!isCustom && Object.keys(provider.models).length === modelFullIds.length;

	const addModel = () =>
		form.setFieldValue("model_markups", (prev) => {
			if (isCustom) return addCustomModelMarkup(prev);

			const usedKeys = new Set(
				Object.keys(prev)
					.filter((key) => splitModelId(key).provider === providerKey)
					.map((key) => splitModelId(key).modelKey),
			);
			const nextKey = Object.keys(provider.models).find(
				(key) => !usedKeys.has(key),
			);
			if (!nextKey) return prev;
			return { ...prev, [joinModelId(providerKey, nextKey)]: {} };
		});

	return (
		<AiProviderTableProvider
			value={{
				form,
				provider,
				providerKey,
				isCustom,
				isLoading,
				renameKey,
				removeKeys,
			}}
		>
			<div className="flex flex-col gap-2">
				<AiProviderTableHeading
					providerName={providerName}
					onRemoveProvider={() => removeProvider(providerKey)}
					onMarkupChange={(markup) => setProviderMarkup(providerKey, markup)}
				/>

				<div className="rounded-lg border shadow-card overflow-hidden">
					<Table.Provider
						config={{
							table,
							numberOfColumns: AI_RATE_TABLE_COLUMNS.length,
							isLoading: false,
							enableSorting: false,
							rowClassName: "h-10",
							flexibleTableColumns: true,
							emptyStateText: isCustom
								? "No custom models yet"
								: "No model overrides yet",
						}}
					>
						<Table.Container>
							<Table.Content className="!rounded-none !border-0 !shadow-none">
								<Table.Header />
								<Table.Body />
							</Table.Content>
						</Table.Container>
					</Table.Provider>
				</div>

				{!allModelsUsed && (
					<IconButton
						type="button"
						variant="muted"
						size="sm"
						className="w-full text-tertiary-foreground text-xs"
						icon={<PlusIcon className="h-3 w-3" />}
						onClick={addModel}
					>
						New
					</IconButton>
				)}
			</div>
		</AiProviderTableProvider>
	);
}
