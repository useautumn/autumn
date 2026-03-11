import type { CreateFeature } from "@autumn/shared";
import { useMemo } from "react";
import { GroupedTabButton } from "@/components/v2/buttons/GroupedTabButton";
import { SheetSection } from "@/components/v2/sheets/SharedSheetComponents";
import type { ModelsDevProvider } from "@/hooks/queries/useOpenRouterModels";
import { useModelsDevPricing } from "@/hooks/queries/useOpenRouterModels";
import { AiCreditSchema } from "./AiCreditSchema";
import { ClassicCreditSchema } from "./ClassicCreditSchema";

type CreditSchemaMode = "classic" | "ai";

function getDefaultModelMarkups(
	providers: Record<string, ModelsDevProvider>,
): Record<string, { markup: number; humanModelName: string }> {
	const result: Record<string, { markup: number; humanModelName: string }> = {};
	const preferredProvider =
		providers["openrouter"] ?? Object.values(providers)[0];
	if (!preferredProvider) return result;

	const providerKey = preferredProvider.id;
	for (const company of ["anthropic", "openai", "google"]) {
		const companyModels = Object.entries(preferredProvider.models)
			.filter(([key]) => key.startsWith(company))
			.slice(0, 3);
		for (const [modelKey, model] of companyModels) {
			result[`${providerKey}/${modelKey}`] = {
				markup: 0,
				humanModelName: model.name,
			};
		}
	}
	return result;
}

interface CreditSystemSchemaProps {
	creditSystem: CreateFeature;
	setCreditSystem: (creditSystem: CreateFeature) => void;
	disableModeSwitch?: boolean;
}

export function CreditSystemSchema({
	creditSystem,
	setCreditSystem,
	disableModeSwitch = false,
}: CreditSystemSchemaProps) {
	const { providers } = useModelsDevPricing();

	const mode: CreditSchemaMode =
		(creditSystem.is_ai_credit_system ?? false) ? "ai" : "classic";

	const handleModeChange = (newMode: string) => {
		if (newMode === "ai") {
			const modelMarkups = getDefaultModelMarkups(providers);
			setCreditSystem({
				...creditSystem,
				config: { ...creditSystem.config, schema: [] },
				model_markups: Object.keys(modelMarkups).length > 0 ? modelMarkups : {},
				is_ai_credit_system: true,
			});
		} else {
			setCreditSystem({
				...creditSystem,
				config: {
					...creditSystem.config,
					schema: [
						{ metered_feature_id: "", feature_amount: 1, credit_amount: 0 },
					],
				},
				model_markups: null,
				is_ai_credit_system: false,
			});
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
					? "Select AI models and set a markup on top of their base pricing"
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
					<ClassicCreditSchema
						creditSystem={creditSystem}
						setCreditSystem={setCreditSystem}
					/>
				) : (
					<AiCreditSchema
						creditSystem={creditSystem}
						setCreditSystem={setCreditSystem}
					/>
				)}
			</div>
		</SheetSection>
	);
}
