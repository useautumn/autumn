import type { Feature } from "@autumn/shared";
import { StepBadge } from "@/components/v2/badges/StepBadge";
import { FeatureSelector } from "@/components/v2/FeatureSelector";
import type { Snippet } from "@/lib/snippets";
import { SnippetCodeBlock } from "./SnippetCodeBlock";

interface UsageStepProps {
	snippet: Snippet;
	stepNumber: number;
	features: Feature[];
	selectedFeatureId: string | null;
	onFeatureChange: (featureId: string) => void;
	showFeatureSelector?: boolean;
}

export function UsageStep({
	snippet,
	stepNumber,
	features,
	selectedFeatureId,
	onFeatureChange,
	showFeatureSelector = false,
}: UsageStepProps) {
	return (
		<div className="flex flex-col gap-3">
			<div className="flex items-center gap-2.5">
				<StepBadge>{stepNumber}</StepBadge>
				<span className="font-medium text-sm">{snippet.title}</span>
			</div>

			{showFeatureSelector && features.length > 0 && (
				<div className="pl-[34px] flex items-center gap-2">
					<span className="text-sm text-t3">Feature:</span>
					<FeatureSelector
						features={features}
						selectedFeatureId={selectedFeatureId}
						onFeatureChange={onFeatureChange}
					/>
				</div>
			)}

			<p className="text-sm text-t2 pl-[34px]">{snippet.description}</p>
			<div className="pl-[34px]">
				<SnippetCodeBlock snippet={snippet} />
			</div>
		</div>
	);
}
