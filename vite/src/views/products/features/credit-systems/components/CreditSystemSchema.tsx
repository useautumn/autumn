import {
	FeatureType,
	isAiCreditSystem,
	joinModelId,
	type ModelsDevProvider,
} from "@autumn/shared";
import { useStore } from "@tanstack/react-form";
import { useMemo } from "react";
import { GroupedTabButton } from "@/components/v2/buttons/GroupedTabButton";
import { SheetSection } from "@/components/v2/sheets/SharedSheetComponents";
import { useModelsDevPricing } from "@/hooks/queries/useAiModelsQuery";
import type { CreditSystemFormInstance } from "../hooks/useCreditSystemForm";
import { AiCreditSchema } from "./AiCreditSchema";
import { ClassicCreditSchema } from "./ClassicCreditSchema";

type CreditSchemaMode = "classic" | "ai";

const DEFAULT_AI_MODEL_COMPANIES = ["anthropic", "google", "openai"] as const;

const getReleaseDateMs = (releaseDate?: string) => {
	if (!releaseDate) return -1;
	const timestamp = Date.parse(releaseDate);
	return Number.isNaN(timestamp) ? -1 : timestamp;
};

function getDefaultModelMarkups(
	providers: Record<string, ModelsDevProvider>,
): Record<string, { markup?: number }> {
	const result: Record<string, { markup?: number }> = {};
	const preferredProvider =
		providers["openrouter"] ?? Object.values(providers)[0];
	if (!preferredProvider) return result;

	const providerKey = preferredProvider.id;
	for (const company of DEFAULT_AI_MODEL_COMPANIES) {
		const companyModels = Object.entries(preferredProvider.models).filter(
			([key]) => key.startsWith(company),
		);

		const latestModel = companyModels.reduce<
			[string, ModelsDevProvider["models"][string]] | null
		>((currentLatest, candidate) => {
			if (!currentLatest) return candidate;
			const currentRelease = getReleaseDateMs(currentLatest[1].release_date);
			const candidateRelease = getReleaseDateMs(candidate[1].release_date);
			return candidateRelease > currentRelease ? candidate : currentLatest;
		}, null);

		if (!latestModel) continue;

		const [modelKey] = latestModel;
		result[joinModelId(providerKey, modelKey)] = {};
	}
	return result;
}

interface CreditSystemSchemaProps {
	form: CreditSystemFormInstance;
	disableModeSwitch?: boolean;
}

export function CreditSystemSchema({
	form,
	disableModeSwitch = false,
}: CreditSystemSchemaProps) {
	const { providers } = useModelsDevPricing();
	const type = useStore(form.store, (s) => s.values.type);

	const mode: CreditSchemaMode = isAiCreditSystem(type) ? "ai" : "classic";

	const handleModeChange = (newMode: string) => {
		if (newMode === "ai") {
			const modelMarkups = getDefaultModelMarkups(providers);
			form.setFieldValue("type", FeatureType.AiCreditSystem);
			form.setFieldValue("config", { ...form.state.values.config, schema: [] });
			form.setFieldValue(
				"model_markups",
				Object.keys(modelMarkups).length > 0 ? modelMarkups : {},
			);
		} else {
			form.setFieldValue("type", FeatureType.CreditSystem);
			form.setFieldValue("config", {
				...form.state.values.config,
				schema: [
					{ metered_feature_id: "", feature_amount: 1, credit_amount: 0 },
				],
			});
			form.setFieldValue("model_markups", {});
		}
	};

	const modeOptions = useMemo(
		() => [
			{ value: "classic", label: "Classic" },
			{ value: "ai", label: "AI" },
		],
		[],
	);

	return (
		<SheetSection
			title="Credit Schema"
			withSeparator={false}
			description={
				mode === "ai"
					? "Select AI models and set a markup on top of their base pricing. All prices in $/M tokens."
					: "When you track usage for these features, the value will be multiplied by the credit cost, then deducted from the balance"
			}
		>
			<div className="flex flex-col gap-3">
				{!disableModeSwitch && (
					<GroupedTabButton
						value={mode}
						onValueChange={handleModeChange}
						options={modeOptions}
						className="w-fit"
					/>
				)}

				{mode === "classic" ? (
					<ClassicCreditSchema form={form} />
				) : (
					<AiCreditSchema form={form} />
				)}
			</div>
		</SheetSection>
	);
}
