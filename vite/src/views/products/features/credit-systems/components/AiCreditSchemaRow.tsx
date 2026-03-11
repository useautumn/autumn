import { X } from "lucide-react";
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
	onModelChange: (oldModelKey: string, newModelKey: string) => void;
	onMarkupChange: (modelKey: string, markup: number) => void;
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
	onModelChange,
	onMarkupChange,
	onRemove,
}: AiCreditSchemaRowProps) {
	const model = provider.models[modelKey];

	const actualInput = model ? (model.cost.input ?? 0) : null;
	const actualOutput = model ? (model.cost.output ?? 0) : null;
	const multiplier = 1 + markup / 100;
	const userInput = actualInput != null ? actualInput * multiplier : null;
	const userOutput = actualOutput != null ? actualOutput * multiplier : null;

	return (
		<div className="grid grid-cols-1 lg:grid-cols-[minmax(0,2fr)_auto_auto_auto_auto_auto_auto] gap-3 lg:gap-2 items-start lg:items-center p-3 lg:p-0 bg-muted/20 lg:bg-transparent rounded-md lg:rounded-none border lg:border-0 border-border/30">
			<div className="min-w-0 max-w-xs">
				<div className="text-xs font-medium text-t-tertiary mb-1 lg:hidden">
					Model
				</div>
				<AiModelSelectDropdown
					value={modelKey}
					onValueChange={(newModelKey) => onModelChange(modelKey, newModelKey)}
					provider={provider}
					isLoading={isLoading}
					humanModelName={humanModelName}
				/>
			</div>
			<div>
				<div className="text-xs font-medium text-t-tertiary mb-1 lg:hidden">
					Input
				</div>
				<Input
					readOnly
					value={formatCost(actualInput)}
					className="w-full lg:w-24 bg-background lg:bg-muted/30 text-t-secondary cursor-default"
					tabIndex={-1}
				/>
			</div>

			<div>
				<div className="text-xs font-medium text-t-tertiary mb-1 lg:hidden">
					Output
				</div>
				<Input
					readOnly
					value={formatCost(actualOutput)}
					className="w-full lg:w-24 bg-background lg:bg-muted/30 text-t-secondary cursor-default"
					tabIndex={-1}
				/>
			</div>

			<div>
				<div className="text-xs font-medium text-t-tertiary mb-1 lg:hidden">
					Markup
				</div>
				<Input
					type="number"
					lang="en"
					value={markup}
					onChange={(e) =>
						onMarkupChange(modelKey, Number(e.target.value) || 0)
					}
					onBlur={(e) => onMarkupChange(modelKey, Number(e.target.value) || 0)}
					placeholder="0"
					className="w-full lg:w-20"
				/>
			</div>

			<div>
				<div className="text-xs font-medium text-t-tertiary mb-1 lg:hidden">
					User Input
				</div>
				<Input
					readOnly
					value={formatCost(userInput)}
					className="w-full lg:w-24 bg-background lg:bg-muted/30 text-t-secondary cursor-default"
					tabIndex={-1}
				/>
			</div>

			<div>
				<div className="text-xs font-medium text-t-tertiary mb-1 lg:hidden">
					User Output
				</div>
				<Input
					readOnly
					value={formatCost(userOutput)}
					className="w-full lg:w-24 bg-background lg:bg-muted/30 text-t-secondary cursor-default"
					tabIndex={-1}
				/>
			</div>

			<div className="flex justify-end lg:justify-center lg:items-center pt-6 lg:pt-0">
				<IconButton
					variant="skeleton"
					iconOrientation="center"
					icon={<X />}
					onClick={() => onRemove(modelKey)}
				/>
			</div>
		</div>
	);
}
