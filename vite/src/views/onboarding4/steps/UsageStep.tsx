import { type Feature, FeatureType } from "@autumn/shared";
import { StepBadge } from "@/components/v2/badges/StepBadge";
import { FeatureSelector } from "@/components/v2/FeatureSelector";
import type { Snippet } from "@/lib/snippets";
import { InfoBox } from "@/views/onboarding2/integrate/components/InfoBox";
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
	const selectedFeature = features.find((f) => f.id === selectedFeatureId);
	const isCreditSystem = selectedFeature?.type === FeatureType.CreditSystem;

	return (
		<div className="flex flex-col gap-3">
			<div className="flex items-center gap-2.5">
				<StepBadge>{stepNumber}</StepBadge>
				<span className="font-medium text-sm mr-auto">{snippet.title}</span>
				{showFeatureSelector && features.length > 0 && (
					<FeatureSelector
						features={features}
						selectedFeatureId={selectedFeatureId}
						onFeatureChange={onFeatureChange}
					/>
				)}
			</div>

			{showFeatureSelector && isCreditSystem && (
				<div className="pl-[34px]">
					<InfoBox variant="note">
						Check and track the underlying features within the credit system
					</InfoBox>
				</div>
			)}

			<p className="text-sm text-t2 pl-[34px]">{snippet.description}</p>
			<div className="pl-[34px]">
				<SnippetCodeBlock snippet={snippet} />
			</div>
		</div>
	);
}
