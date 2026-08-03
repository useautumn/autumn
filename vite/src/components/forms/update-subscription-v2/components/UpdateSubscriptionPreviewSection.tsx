import { PreviewSection } from "@/components/forms/shared/PreviewSection";
import { useUpdateSubscriptionFormContext } from "../context/UpdateSubscriptionFormProvider";

export function UpdateSubscriptionPreviewSection() {
	const { previewQuery, hasChanges } = useUpdateSubscriptionFormContext();

	return <PreviewSection previewQuery={previewQuery} hidden={!hasChanges} />;
}
