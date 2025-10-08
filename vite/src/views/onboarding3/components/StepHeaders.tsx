import type { ProductV2 } from "@autumn/shared";
import { SheetHeader } from "@/components/v2/sheets/InlineSheet";
import {
	getStepNumber,
	OnboardingStep,
	stepConfig,
} from "../utils/onboardingUtils";
import { PlaygroundToolbar } from "./PlaygroundStep/PlaygroundToolbar";

interface StepHeaderProps {
	step: OnboardingStep;
	selectedProductId: string;
	products: ProductV2[];
	onPlanSelect: (planId: string) => void;
	onCreatePlanSuccess: (newProduct: ProductV2) => Promise<void>;
	playgroundMode?: "edit" | "preview";
	setPlaygroundMode?: (mode: "edit" | "preview") => void;
	sheet?: string | null;
	editingState?: { type: "plan" | "feature" | null; id: string | null };
}

export const StepHeader = ({
	step,
	selectedProductId,
	products,
	onPlanSelect,
	onCreatePlanSuccess,
	playgroundMode = "edit",
	setPlaygroundMode,
	sheet,
	editingState,
}: StepHeaderProps) => {
	const stepNum = getStepNumber(step);
	const config = stepConfig[step];

	if (step === OnboardingStep.Playground) {
		return (
			<div className="flex flex-col gap-2">
				<SheetHeader
					title={`Step ${stepNum}: ${config.title}`}
					description={config.description}
					noSeparator={true}
					className="p-0 sticky"
					isOnboarding={true}
				/>
				<PlaygroundToolbar
					playgroundMode={playgroundMode ?? "edit"}
					setPlaygroundMode={setPlaygroundMode ?? (() => {})}
					selectedProductId={selectedProductId}
					products={products}
					onPlanSelect={onPlanSelect}
					onCreatePlanSuccess={onCreatePlanSuccess}
				/>
			</div>
		);
	}

	return (
		<SheetHeader
			title={`Step ${stepNum}: ${config.title}`}
			description={config.description}
			noSeparator={true}
			className="p-0 sticky"
			isOnboarding={true}
		/>
	);
};
