import {
	IconButton,
	Input,
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@autumn/ui";
import { InfoIcon, X } from "lucide-react";
import { useAiProviderTable } from "../hooks/AiProviderTableContext";
import { useProviderMarkup } from "../hooks/useProviderMarkup";

const MARKUP_INPUT_PATTERN = /^-?\d*\.?\d*$/;

export function AiProviderTableHeading({
	providerName,
	onRemoveProvider,
	onMarkupChange,
}: {
	providerName: string;
	onRemoveProvider: () => void;
	onMarkupChange: (markup: number | undefined) => void;
}) {
	const { form, providerKey, isCustom } = useAiProviderTable();
	const { defaultMarkup, providerMarkup } = useProviderMarkup(
		form,
		providerKey,
	);

	return (
		<div className="flex items-center justify-between pr-2 pt-1">
			<span className="flex items-center gap-2 text-sm font-medium text-foreground">
				{providerName}
				{isCustom ? (
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
				) : (
					<img
						src={`https://models.dev/logos/${providerKey}.svg`}
						alt={providerName}
						className="h-4 w-4 dark:invert opacity-40"
					/>
				)}
			</span>

			<div className="flex items-center gap-2">
				{!isCustom && (
					<div className="flex items-center gap-1.5">
						<span className="text-xs text-subtle">Markup %</span>
						<Input
							type="text"
							inputMode="numeric"
							aria-label={`${providerName} markup`}
							value={providerMarkup == null ? "" : String(providerMarkup)}
							onChange={(e) => {
								const raw = e.target.value;
								if (!MARKUP_INPUT_PATTERN.test(raw)) return;
								if (raw === "") {
									onMarkupChange(undefined);
									return;
								}
								const parsed = Number(raw);
								if (!Number.isNaN(parsed)) onMarkupChange(parsed);
							}}
							placeholder={String(defaultMarkup)}
							className="w-20"
						/>
					</div>
				)}
				<IconButton
					variant="skeleton"
					iconOrientation="center"
					aria-label={`Remove ${providerName}`}
					icon={<X className="h-3.5 w-3.5" />}
					onClick={onRemoveProvider}
					className="!text-subtle hover:!text-foreground"
				/>
			</div>
		</div>
	);
}
