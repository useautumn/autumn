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
			<div>
				<SheetHeader
					title={`Step ${stepNum}: ${config.title}`}
					description={config.description}
					noSeparator={true}
					className="p-0"
				/>
				<div className="mt-3 grid grid-cols-2 gap-2 p-0">
					<Select value={selectedProductId} onValueChange={onPlanSelect}>
						<SelectTrigger>
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
					<CreatePlanDialog onSuccess={onCreatePlanSuccess} />
				</div>
			</div>
		);
	}

	return (
		<SheetHeader
			title={`Step ${stepNum}: ${config.title}`}
			description={config.description}
			noSeparator={true}
			className={step === OnboardingStep.Completion ? "p-2" : "p-0"}
		/>
	);
};
