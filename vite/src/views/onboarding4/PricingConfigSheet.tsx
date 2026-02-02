import type { AgentPricingConfig } from "@autumn/shared";
import {
	CodeGroup,
	CodeGroupCode,
	CodeGroupCopyButton,
	CodeGroupList,
	CodeGroupTab,
} from "@/components/v2/CodeGroup";
import {
	Sheet,
	SheetContent,
	SheetHeader,
	SheetTitle,
} from "@/components/v2/sheets/Sheet";

interface PricingConfigSheetProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	config: AgentPricingConfig | null;
}

/** Strip out display fields from features for cleaner JSON output */
function filterConfigForDisplay({
	config,
}: {
	config: AgentPricingConfig;
}): AgentPricingConfig {
	return {
		...config,
		// features: config.features.map((feature) => {
		// 	const { display, ...rest } = feature;
		// 	return rest as AgentFeature;
		// }),
	};
}

export function PricingConfigSheet({
	open,
	onOpenChange,
	config,
}: PricingConfigSheetProps) {
	if (!config) return null;

	const filteredConfig = filterConfigForDisplay({ config });
	const formattedJson = JSON.stringify(filteredConfig, null, 2);

	return (
		<Sheet open={open} onOpenChange={onOpenChange}>
			<SheetContent className="flex flex-col overflow-hidden bg-background min-w-xl">
				<SheetHeader>
					<SheetTitle>Pricing Configuration</SheetTitle>
					<p className="text-t3 text-sm">
						Generated configuration with {config.products.length} product(s) and{" "}
						{config.features.length} feature(s)
					</p>
				</SheetHeader>

				<div className="flex-1 overflow-hidden flex flex-col px-4 pb-4">
					<CodeGroup value="json" className="flex-1 h-0 flex flex-col">
						<CodeGroupList>
							<CodeGroupTab value="json">JSON</CodeGroupTab>
							<CodeGroupCopyButton
								onCopy={() => navigator.clipboard.writeText(formattedJson)}
							/>
						</CodeGroupList>
						<div className="flex-1 h-0 overflow-y-auto border border-t-0 rounded-b-lg bg-white dark:bg-background">
							<CodeGroupCode language="json">{formattedJson}</CodeGroupCode>
						</div>
					</CodeGroup>
				</div>
			</SheetContent>
		</Sheet>
	);
}
