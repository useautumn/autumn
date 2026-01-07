import { type CreditSystemConfig, FeatureType } from "@autumn/shared";
import { Code } from "@phosphor-icons/react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/v2/buttons/Button";
import { SDKSelector } from "@/components/v2/SDKSelector";
import { Sheet, SheetContent } from "@/components/v2/sheets/Sheet";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import { useSDKStore } from "@/hooks/stores/useSDKStore";
import {
	DEFAULT_STACK_CONFIG,
	getSnippetsForStep,
	type StackConfig,
	type StepId,
	stepNeedsStackConfig,
} from "@/lib/snippets";
import { InfoBox } from "@/views/onboarding2/integrate/components/InfoBox";
import { AttachStep } from "./steps/AttachStep";
import { BackendSetupStep } from "./steps/BackendSetupStep";
import { EnvSetupStep } from "./steps/EnvSetupStep";
import { SnippetStep } from "./steps/SnippetStep";
import { UsageStep } from "./steps/UsageStep";

interface CodeSheetProps {
	stepId: StepId;
	title: string;
	description: string;
}

export function CodeSheet({ stepId, title, description }: CodeSheetProps) {
	const [open, setOpen] = useState(false);
	const selectedSDK = useSDKStore((s) => s.selectedSDK);
	const [stackConfig, setStackConfig] =
		useState<StackConfig>(DEFAULT_STACK_CONFIG);

	// Fetch features
	const { features } = useFeaturesQuery();

	// Feature selection state for usage step
	const [selectedFeatureId, setSelectedFeatureId] = useState<string | null>(
		null,
	);

	// Auto-select first feature when features load
	useEffect(() => {
		if (stepId === "usage" && features.length > 0 && !selectedFeatureId) {
			setSelectedFeatureId(features[0].id);
		}
	}, [stepId, features, selectedFeatureId]);

	const showStackSelector = stepNeedsStackConfig({ stepId, sdk: selectedSDK });

	// Get the selected feature and determine the feature ID for snippets
	const selectedFeature = features.find((f) => f.id === selectedFeatureId);
	const isBoolean = selectedFeature?.type === FeatureType.Boolean;

	// For credit systems, use the first underlying feature ID from the schema
	const getSnippetFeatureId = () => {
		if (!selectedFeature || !selectedFeatureId) return undefined;

		if (selectedFeature.type === FeatureType.CreditSystem) {
			const config = selectedFeature.config as CreditSystemConfig | undefined;
			const firstSchemaItem = config?.schema?.[0];
			return firstSchemaItem?.metered_feature_id ?? selectedFeatureId;
		}

		return selectedFeatureId;
	};
	const snippetFeatureId = getSnippetFeatureId();

	// Build dynamic params
	const dynamicParams = useMemo(
		() => ({
			featureId: snippetFeatureId,
			isBoolean,
		}),
		[snippetFeatureId, isBoolean],
	);

	const allSnippets = getSnippetsForStep({
		stepId,
		sdk: selectedSDK,
		stackConfig: showStackSelector ? stackConfig : undefined,
		dynamicParams,
	});

	// Filter out "track" snippet for boolean features
	const snippets = isBoolean
		? allSnippets.filter((s) => s.id !== "track")
		: allSnippets;

	const renderSnippetStep = (snippet: (typeof snippets)[0], index: number) => {
		const stepNumber = index + 1;

		switch (snippet.id) {
			case "env-setup":
				return (
					<EnvSetupStep
						key={snippet.id}
						snippet={snippet}
						stepNumber={stepNumber}
						hideCodeBlock={selectedSDK !== "react"}
					/>
				);
			case "backend-setup":
				return (
					<BackendSetupStep
						key={snippet.id}
						snippet={snippet}
						stepNumber={stepNumber}
						stackConfig={stackConfig}
						onStackConfigChange={setStackConfig}
					/>
				);
			case "attach":
				return selectedSDK === "react" ? (
					<AttachStep
						key={snippet.id}
						snippet={snippet}
						stepNumber={stepNumber}
					/>
				) : (
					<SnippetStep
						key={snippet.id}
						snippet={snippet}
						stepNumber={stepNumber}
					/>
				);
			case "check":
			case "track":
				return (
					<UsageStep
						key={snippet.id}
						snippet={snippet}
						stepNumber={stepNumber}
						features={features}
						selectedFeatureId={selectedFeatureId}
						onFeatureChange={setSelectedFeatureId}
						showFeatureSelector={snippet.id === "check"}
					/>
				);
			default:
				return (
					<SnippetStep
						key={snippet.id}
						snippet={snippet}
						stepNumber={stepNumber}
					/>
				);
		}
	};

	return (
		<Sheet open={open} onOpenChange={setOpen}>
			<Button
				variant="secondary"
				size="sm"
				onClick={(e) => {
					e.stopPropagation();
					setOpen(true);
				}}
			>
				<Code className="size-3.5" />
				Show docs
			</Button>
			<SheetContent
				className="flex flex-col overflow-hidden bg-background min-w-xl"
				hideCloseButton
			>
				<div className="flex-1 overflow-y-auto">
					<div className="p-4 pb-0">
						<div className="flex items-center justify-between gap-4">
							<h2 className="text-main">{title}</h2>
							<SDKSelector />
						</div>
						<p className="text-t3 text-sm mt-1.5">{description}</p>
					</div>

					<div className="px-4 pb-4 pt-4">
						<div className="flex flex-col gap-6">
							{showStackSelector && (
								<InfoBox variant="note">
									React hooks are supported for fullstack Typescript apps.
								</InfoBox>
							)}

							{snippets.map((snippet, index) =>
								renderSnippetStep(snippet, index),
							)}
						</div>
					</div>
				</div>
			</SheetContent>
		</Sheet>
	);
}
