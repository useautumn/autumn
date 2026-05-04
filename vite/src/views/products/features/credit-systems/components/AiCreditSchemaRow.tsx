import type { ModelsDevProvider } from "@autumn/shared";
import { X } from "lucide-react";
import { useState } from "react";
import { IconButton } from "@/components/v2/buttons/IconButton";
import { Input } from "@/components/v2/inputs/Input";
import { AiModelSelectDropdown } from "./AiModelSelectDropdown";

interface AiCreditSchemaRowProps {
	modelKey: string;
	markup: number;
	humanModelName?: string;
	provider: ModelsDevProvider;
	isLoading: boolean;
	isCustom?: boolean;
	inputCost?: number;
	outputCost?: number;
	onModelChange: (oldModelKey: string, newModelKey: string) => void;
	onMarkupChange: (modelKey: string, markup: number) => void;
	onCostChange?: (
		modelKey: string,
		field: "input_cost" | "output_cost",
		value: number,
	) => void;
	onRemove: (modelKey: string) => void;
}

function formatCost(value: number | null | undefined): string {
	if (value == null) return "–";
	return value.toFixed(2);
}

export function AiCreditSchemaRow({
	modelKey,
	markup,
	humanModelName,
	provider,
	isLoading,
	isCustom,
	inputCost,
	outputCost,
	onModelChange,
	onMarkupChange,
	onCostChange,
	onRemove,
}: AiCreditSchemaRowProps) {
	const model = provider.models[modelKey];

	const actualInput = isCustom
		? (inputCost ?? 0)
		: model
			? (model.cost.input ?? 0)
			: null;
	const actualOutput = isCustom
		? (outputCost ?? 0)
		: model
			? (model.cost.output ?? 0)
			: null;
	const multiplier = 1 + markup / 100;
	const userInput = actualInput != null ? actualInput * multiplier : null;
	const userOutput = actualOutput != null ? actualOutput * multiplier : null;

	const [localModelName, setLocalModelName] = useState(modelKey);

	return (
		<div className="flex flex-col gap-0.5 py-0.5 border-b border-border/20 last:border-b-0">
			<div className="grid grid-cols-[minmax(0,2.7fr)_minmax(0,0.8fr)_minmax(0,0.8fr)_minmax(0,0.8fr)_auto] items-center gap-1 px-0.5">
				{/* Model Name */}
				<div className="min-w-0">
					{isCustom ? (
						<Input
							value={localModelName}
							onChange={(e) => setLocalModelName(e.target.value)}
							onBlur={() => {
								if (localModelName !== modelKey) {
									onModelChange(modelKey, localModelName);
								}
							}}
							placeholder="my-model-id"
							className="w-full"
						/>
					) : (
						<AiModelSelectDropdown
							value={modelKey}
							onValueChange={(newModelKey) =>
								onModelChange(modelKey, newModelKey)
							}
							provider={provider}
							isLoading={isLoading}
							humanModelName={humanModelName}
						/>
					)}
				</div>

				{/* Input Cost */}
				<div className="min-w-0">
					{isCustom ? (
						<Input
							type="number"
							lang="en"
							value={inputCost ?? 0}
							onChange={(e) =>
								onCostChange?.(
									modelKey,
									"input_cost",
									Number(e.target.value) || 0,
								)
							}
							placeholder="0"
							className="w-full"
						/>
					) : (
						<div className="h-9 flex items-center text-sm text-t-secondary px-1">
							{formatCost(actualInput)}
						</div>
					)}
				</div>

				{/* Output Cost */}
				<div className="min-w-0">
					{isCustom ? (
						<Input
							type="number"
							lang="en"
							value={outputCost ?? 0}
							onChange={(e) =>
								onCostChange?.(
									modelKey,
									"output_cost",
									Number(e.target.value) || 0,
								)
							}
							placeholder="0"
							className="w-full"
						/>
					) : (
						<div className="h-9 flex items-center text-sm text-t-secondary px-1">
							{formatCost(actualOutput)}
						</div>
					)}
				</div>

				{/* Markup % */}
				<div className="min-w-0">
					<Input
						type="number"
						lang="en"
						value={markup}
						onChange={(e) =>
							onMarkupChange(modelKey, Number(e.target.value) || 0)
						}
						placeholder="0"
						className="w-full"
					/>
				</div>

				{/* Remove Button */}
				<IconButton
					variant="skeleton"
					iconOrientation="center"
					icon={<X className="h-3.5 w-3.5" />}
					onClick={() => onRemove(modelKey)}
					className="shrink-0"
				/>
			</div>

			{/* User Pays Info */}
			{(userInput != null || userOutput != null) && (
				<div className="text-[11px] leading-4 text-t-tertiary px-0.5">
					User pays: ${formatCost(userInput)} in / ${formatCost(userOutput)} out
					$/M
				</div>
			)}
		</div>
	);
}
