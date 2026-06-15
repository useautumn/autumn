import { FeatureType, isAiCreditSystem } from "@autumn/shared";
import { useStore } from "@tanstack/react-form";
import { useMemo } from "react";
import { BetaBadge } from "@/components/v2/badges/BetaBadge";
import { GroupedTabButton } from "@/components/v2/buttons/GroupedTabButton";
import { SheetSection } from "@/components/v2/sheets/SharedSheetComponents";
import type { CreditSystemFormInstance } from "../hooks/useCreditSystemForm";
import { AiCreditSchema } from "./AiCreditSchema";
import { ClassicCreditSchema } from "./ClassicCreditSchema";

type CreditSchemaMode = "classic" | "ai";

interface CreditSystemSchemaProps {
	form: CreditSystemFormInstance;
	disableModeSwitch?: boolean;
}

export function CreditSystemSchema({
	form,
	disableModeSwitch = false,
}: CreditSystemSchemaProps) {
	const type = useStore(form.store, (s) => s.values.type);

	const mode: CreditSchemaMode = isAiCreditSystem(type) ? "ai" : "classic";

	const handleModeChange = (newMode: string) => {
		if (newMode === "ai") {
			form.setFieldValue("type", FeatureType.AiCreditSystem);
			form.setFieldValue("config", { ...form.state.values.config, schema: [] });
			form.setFieldValue("model_markups", {});
			form.setFieldValue("provider_markups", {});
		} else {
			form.setFieldValue("type", FeatureType.CreditSystem);
			form.setFieldValue("config", {
				...form.state.values.config,
				schema: [
					{ metered_feature_id: "", feature_amount: 1, credit_amount: 0 },
				],
			});
			form.setFieldValue("model_markups", {});
			form.setFieldValue("provider_markups", {});
		}
	};

	const modeOptions = useMemo(
		() => [
			{ value: "classic", label: "Classic" },
			{
				value: "ai",
				label: (
					<span className="flex items-center gap-1.5">
						AI
						<BetaBadge />
					</span>
				),
			},
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
						className="w-full"
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
