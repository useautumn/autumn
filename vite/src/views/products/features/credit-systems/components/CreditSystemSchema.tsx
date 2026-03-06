import { GroupedTabButton } from "@/components/v2/buttons/GroupedTabButton";
import { SheetSection } from "@/components/v2/sheets/SharedSheetComponents";
import type { OpenRouterModel } from "@/hooks/queries/useOpenRouterModels";
import { useOpenRouterModels } from "@/hooks/queries/useOpenRouterModels";
import type { CreateFeature } from "@autumn/shared";
import { useMemo } from "react";
import { AiCreditSchema } from "./AiCreditSchema";
import { ClassicCreditSchema } from "./ClassicCreditSchema";

type CreditSchemaMode = "classic" | "ai";

function getFlagshipModels(models: OpenRouterModel[]): OpenRouterModel[] {
	const flagshipModels: OpenRouterModel[] = [];
	const interestedCompanies = ["anthropic", "openai", "google"];
	for (const company of interestedCompanies) {
		const companyModels = models
			.filter((model) => model.id.startsWith(company))
			.sort(
				(a, b) =>
					new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
			)
			.slice(0, 3);
		flagshipModels.push(...companyModels);
	}
	return flagshipModels;
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
	const { models } = useOpenRouterModels();

	const mode: CreditSchemaMode =
		creditSystem.model_markups != null ? "ai" : "classic";

	const handleModeChange = (newMode: string) => {
		if (newMode === "ai") {
			const flagshipModels = getFlagshipModels(models);
			const modelMarkups = Object.fromEntries(
				flagshipModels.map((model) => [model.id, { markup: 0 }]),
			);
			setCreditSystem({
				...creditSystem,
				config: { ...creditSystem.config, schema: [] },
				model_markups: flagshipModels.length > 0 ? modelMarkups : {},
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
