import type { CheckoutResponse } from "@autumn/shared";
import type { ReactNode } from "react";
import { useIsLatestVersion } from "@/hooks/stores/useProductStore";
import { formatUnixToDate } from "@/utils/formatUtils/formatDateUtils";
import { InfoBox } from "@/views/onboarding2/integrate/components/InfoBox";

export const AttachConfirmationInfo = ({
	previewData,
}: {
	previewData?: CheckoutResponse | null;
}) => {
	const isLatestVersion = useIsLatestVersion(previewData?.product);

	const renderInfoBoxes = (): ReactNode[] => {
		const boxes: ReactNode[] = [];

		if (!previewData) {
			return boxes;
		}

		if (!isLatestVersion) {
			boxes.push(
				<InfoBox key="latest-version" variant="info">
					You're enabling a previous version (v{previewData.product.version}) of
					this plan.
				</InfoBox>,
			);
		}

		// Payment method required
		if (previewData.url) {
			let secondaryText = "";
			if (previewData.product.free_trial?.card_required === true) {
				secondaryText = "to start this trial";
			} else {
				secondaryText = "as this plan has prices";
			}

			boxes.push(
				<InfoBox key="payment-required" variant="warning">
					A payment method is required {secondaryText}
				</InfoBox>,
			);
		}

		if (previewData.product.free_trial) {
			let secondaryText = "";
			if (previewData.product.free_trial?.card_required === true) {
				secondaryText = " and the customer will be charged";
			} else {
				secondaryText = " and this plan will expire";
			}

			boxes.push(
				<InfoBox key="free-trial" variant="info">
					Trial ends {formatUnixToDate(previewData.next_cycle?.starts_at)}
					{secondaryText}
				</InfoBox>,
			);
		}

		// Show scenario-based info if switching from another plan and not attaching add-on
		if (
			previewData.current_product &&
			previewData.product &&
			!previewData.product.is_add_on
		) {
			const scenario = previewData.product.scenario as
				| "upgrade"
				| "downgrade"
				| "cancel"
				| "new"
				| string;

			switch (scenario) {
				case "upgrade":
					boxes.push(
						<InfoBox key="product-upgrade" variant="note">
							This upgrade will immediately replace the customer's current plan:{" "}
							{previewData.current_product.name}
						</InfoBox>,
					);
					break;
				case "downgrade":
					boxes.push(
						<InfoBox key="product-downgrade" variant="warning">
							This downgrade will replace the customer's current plan:{" "}
							{previewData.current_product.name}
						</InfoBox>,
					);
					break;
				case "cancel":
					boxes.push(
						<InfoBox key="product-cancel" variant="error">
							This will cancel the customer's current billing subscription:{" "}
							{previewData.current_product.name}
						</InfoBox>,
					);
					break;
				case "new":
					boxes.push(
						<InfoBox key="new-product" variant="info">
							This will be enabled alongside existing plans{" "}
						</InfoBox>,
					);
			}
		}

		if (
			previewData.next_cycle?.starts_at &&
			previewData.product?.scenario === "downgrade"
		) {
			const startsAtString = formatUnixToDate(previewData.next_cycle.starts_at);

			boxes.push(
				<InfoBox key="downgrade" variant="warning">
					Plan change will take effect next cycle, on{" "}
					<span className="font-semibold">{startsAtString}</span>
				</InfoBox>,
			);
		}

		// If switching products, show info about current product

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
