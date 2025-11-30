import type { CheckoutResponseV0, ProductV2 } from "@autumn/shared";
import type { ReactNode } from "react";
import { useMemo } from "react";
import {
	useHasBillingChanges,
	useHasChanges,
	usePrepaidItems,
} from "@/hooks/stores/useProductStore";
import { formatUnixToDate } from "@/utils/formatUtils/formatDateUtils";
import { InfoBox } from "@/views/onboarding2/integrate/components/InfoBox";
import type { UseAttachProductForm } from "./use-attach-product-form";

export const UpdateConfirmationInfo = ({
	previewData,
	product,
	form,
}: {
	previewData?: CheckoutResponseV0 | null;
	product?: ProductV2;
	form: UseAttachProductForm;
}) => {
	const hasChanges = useHasChanges();
	const hasBillingChanges = useHasBillingChanges({
		baseProduct: previewData?.current_product,
		newProduct: previewData?.product,
	});

	console.log("previewData", previewData);

	const hasPrepaidQuantityChanges = useHasPrepaidQuantityChanges(product, form);

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

		// Prepaid quantity changes notice
		if (hasPrepaidQuantityChanges) {
			boxes.push(
				<InfoBox key="prepaid-quantity-changes" variant="info">
					Prepaid quantities have been updated
				</InfoBox>,
			);
		}

		// No billing changes notice
		if (!hasBillingChanges && !hasPrepaidQuantityChanges) {
			boxes.push(
				<InfoBox key="no-billing-changes" variant="success">
					No changes to billing will be made
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
		<div className="space-y-2 px-4 mt-4">
			{infoBoxes.map((box, index) => (
				<div key={index}>{box}</div>
			))}
		</div>
	);
};

const useHasPrepaidQuantityChanges = (
	product: ProductV2 | undefined,
	form: UseAttachProductForm,
) => {
	const { prepaidItems } = usePrepaidItems({ product });
	const currentPrepaidOptions = form.state.values.prepaidOptions;
	const defaultPrepaidOptions = form.options.defaultValues?.prepaidOptions;

	return useMemo(() => {
		if (prepaidItems.length === 0 || !currentPrepaidOptions) {
			return false;
		}

		return prepaidItems.some((item) => {
			const currentQuantity = currentPrepaidOptions[item.feature_id as string];
			const defaultQuantity =
				defaultPrepaidOptions?.[item.feature_id as string];
			return currentQuantity !== defaultQuantity;
		});
	}, [prepaidItems, currentPrepaidOptions, defaultPrepaidOptions]);
};
