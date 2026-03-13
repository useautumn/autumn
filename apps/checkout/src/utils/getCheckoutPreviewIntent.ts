import type {
	AttachPreviewResponse,
	PreviewUpdateSubscriptionResponse,
} from "@autumn/shared";

export const getCheckoutPreviewIntent = ({
	preview,
}: {
	preview?: AttachPreviewResponse | PreviewUpdateSubscriptionResponse;
}) => {
	if (!preview || preview.object !== "update_subscription_preview") {
		return undefined;
	}

	return preview.intent;
};
