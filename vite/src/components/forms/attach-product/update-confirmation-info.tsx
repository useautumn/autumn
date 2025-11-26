import type { ReactNode } from "react";
import {
	useHasBillingChanges,
	useHasChanges,
} from "@/hooks/stores/useProductStore";
import { formatUnixToDate } from "@/utils/formatUtils/formatDateUtils";
import { InfoBox } from "@/views/onboarding2/integrate/components/InfoBox";
import { useAttachPreview } from "./use-attach-preview";

export const UpdateConfirmationInfo = () => {
	const { data: previewData } = useAttachPreview();
	const hasChanges = useHasChanges();
	const hasBillingChanges = useHasBillingChanges({
		baseProduct: previewData?.current_product,
		newProduct: previewData?.product,
	});

	const renderInfoBoxes = (): ReactNode[] => {
		const boxes: ReactNode[] = [];

		if (!previewData) {
			return boxes;
		}

		// Plan customization notice
		if (hasChanges) {
			boxes.push(
				<InfoBox key="customized" variant="success">
					This plan has been customized for this customer
				</InfoBox>,
			);
		}

		// Version change notice
		if (previewData.current_product?.version !== previewData.product.version) {
			boxes.push(
				<InfoBox key="version-change" variant="info">
					You're switching from v{previewData.current_product?.version} to v
					{previewData.product.version} of this plan
				</InfoBox>,
			);
		}

		// No billing changes notice
		if (!hasBillingChanges) {
			boxes.push(
				<InfoBox key="no-billing-changes" variant="success">
					No billing changes will be made
				</InfoBox>,
			);
		} else {
			boxes.push(
				<InfoBox key="billing-changes" variant="warning">
					Billing changes will be made
				</InfoBox>,
			);
		}

		// Free trial updated
		if (previewData.product.free_trial) {
			const trialEndDate = previewData.next_cycle?.starts_at
				? formatUnixToDate(previewData.next_cycle.starts_at)
				: null;

			boxes.push(
				<InfoBox key="free-trial-updated" variant="info">
					Free trial updated
					{trialEndDate && (
						<>
							{" "}
							- trial ends <span className="font-semibold">{trialEndDate}</span>
						</>
					)}
				</InfoBox>,
			);
		}

		return boxes;
	};

	const infoBoxes = renderInfoBoxes();

	if (infoBoxes.length === 0) {
		return null;
	}

	return (
		<div className="space-y-2">
			{infoBoxes.map((box, index) => (
				<div key={index}>{box}</div>
			))}
		</div>
	);
};
