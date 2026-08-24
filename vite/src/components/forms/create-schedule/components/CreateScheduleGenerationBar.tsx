import { BillingPromptBar } from "@/components/forms/shared/generation/BillingPromptBar";
import { useCreateScheduleFormContext } from "../context/CreateScheduleFormProvider";

export function CreateScheduleGenerationBar() {
	const { generation } = useCreateScheduleFormContext();

	return (
		<BillingPromptBar
			generation={generation}
			placeholder="Describe your schedule..."
		/>
	);
}
