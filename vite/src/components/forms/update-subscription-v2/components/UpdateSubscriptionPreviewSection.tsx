import { PreviewSection } from "@/components/forms/shared/PreviewSection";
import { useUpdateSubscriptionFormContext } from "../context/UpdateSubscriptionFormProvider";
import { CollectionMethodSwitchNotice } from "./CollectionMethodSwitchNotice";

export function UpdateSubscriptionPreviewSection() {
	const { previewQuery, hasChanges, collectionMethodSwitch } =
		useUpdateSubscriptionFormContext();

	return (
		<>
			<CollectionMethodSwitchNotice />
			<PreviewSection
				previewQuery={previewQuery}
				hidden={!hasChanges && !collectionMethodSwitch.isActive}
			/>
		</>
	);
}
