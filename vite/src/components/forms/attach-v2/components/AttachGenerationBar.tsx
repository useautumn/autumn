import { BillingPromptBar } from "@/components/forms/shared/generation/BillingPromptBar";
import { useAttachFormContext } from "../context/AttachFormProvider";

export function AttachGenerationBar() {
	const { generation } = useAttachFormContext();

	return (
		<BillingPromptBar
			generation={generation}
			placeholder="Describe your attach..."
		/>
	);
}
