import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/v2/selects/Select";
import { SheetHeader } from "@/components/v2/sheets/InlineSheet";
import CreatePlanDialog from "../../products/products/components/CreatePlanDialog";
import {
	getStepNumber,
	OnboardingStep,
	stepConfig,
} from "../utils/onboardingUtils";

interface StepHeaderProps {
	step: OnboardingStep;
	selectedProductId: string;
	products: any[];
	onPlanSelect: (planId: string) => void;
	onCreatePlanSuccess: (newProduct: any) => Promise<void>;
}

export const StepHeader = ({
	step,
	selectedProductId,
	products,
	onPlanSelect,
	onCreatePlanSuccess,
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
				<div className="flex gap-2 items-center justify-end">
					<Select value={selectedProductId} onValueChange={onPlanSelect}>
						<SelectTrigger className="max-h-7 h-7 text-xs">
							<SelectValue placeholder="Select plan" />
						</SelectTrigger>
						<SelectContent>
							{products.map((prod) => (
								<SelectItem key={prod.id} value={prod.id}>
									{prod.name}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
					<CreatePlanDialog onSuccess={onCreatePlanSuccess} size="sm" />
				</div>
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
