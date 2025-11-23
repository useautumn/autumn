import { InfoBox } from "@/views/onboarding2/integrate/components/InfoBox";
import { useAttachPreview } from "./use-attach-preview";

export const AttachConfirmationInfo = () => {
	const { data: previewData } = useAttachPreview();

	if (previewData?.url) {
		return <InfoBox>A payment method is required to enable this plan</InfoBox>;
	}

	return (
		<div>
			<h1>Attach Confirmation</h1>
		</div>
	);
};
