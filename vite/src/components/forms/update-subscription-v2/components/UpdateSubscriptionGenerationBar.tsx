import { BillingPromptBar } from "@/components/forms/shared/generation/BillingPromptBar";
import { useUpdateSubscriptionFormContext } from "../context/UpdateSubscriptionFormProvider";

export function UpdateSubscriptionGenerationBar() {
	const { generation } = useUpdateSubscriptionFormContext();

	return (
		<BillingPromptBar
			generation={generation}
			placeholder="Describe your update..."
		/>
	);
}
