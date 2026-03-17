import { X } from "lucide-react";
import { useState } from "react";
import { IconButton } from "@/components/v2/buttons/IconButton";
import { Input } from "@/components/v2/inputs/Input";
import type { ModelsDevProvider } from "@/hooks/queries/useOpenRouterModels";
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
		<div className="flex flex-col gap-2 p-3 bg-muted/20 rounded-md border border-border/30">
			<div className="flex items-center gap-2">
				<div className="min-w-0 flex-1">
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
				<IconButton
					variant="skeleton"
					iconOrientation="center"
					icon={<X className="h-3.5 w-3.5" />}
					onClick={() => onRemove(modelKey)}
				/>
			</div>

			<div className="grid grid-cols-3 gap-2">
				<div>
					<div className="text-xs font-medium text-t-tertiary mb-1">
						{isCustom ? "Input $/M" : "Cost In"}
					</div>
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
							onBlur={(e) =>
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
						<Input
							readOnly
							value={formatCost(actualInput)}
							className="w-full bg-muted/30 text-t-secondary cursor-default"
							tabIndex={-1}
						/>
					)}
				</div>
				<div>
					<div className="text-xs font-medium text-t-tertiary mb-1">
						{isCustom ? "Output $/M" : "Cost Out"}
					</div>
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
							onBlur={(e) =>
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
						<Input
							readOnly
							value={formatCost(actualOutput)}
							className="w-full bg-muted/30 text-t-secondary cursor-default"
							tabIndex={-1}
						/>
					)}
				</div>
				<div>
					<div className="text-xs font-medium text-t-tertiary mb-1">
						Markup %
					</div>
					<Input
						type="number"
						lang="en"
						value={markup}
						onChange={(e) =>
							onMarkupChange(modelKey, Number(e.target.value) || 0)
						}
						onBlur={(e) =>
							onMarkupChange(modelKey, Number(e.target.value) || 0)
						}
						placeholder="0"
						className="w-full"
					/>
				</div>
			</div>

			{(userInput != null || userOutput != null) && (
				<div className="text-xs text-t-tertiary">
					User pays: ${formatCost(userInput)} in / ${formatCost(userOutput)} out
					$/M
				</div>
			)}
		</div>
	);
}
