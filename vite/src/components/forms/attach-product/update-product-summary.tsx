import type {
	PreviewUpdateSubscriptionResponse,
	ProductV2,
} from "@autumn/shared";
import { LoadingShimmerText } from "@/components/v2/LoadingShimmerText";
import { UpdateConfirmationInfo } from "../update-subscription/update-confirmation-info";
import { AttachProductLineItems } from "./attach-product-line-items";
import { AttachProductTotals } from "./attach-product-totals";
import type { UseAttachProductForm } from "./use-attach-product-form";

export function UpdateProductSummary({
	product,
	previewData,
	isLoading,
	form,
}: {
	product?: ProductV2;
	previewData?: PreviewUpdateSubscriptionResponse | null;
	isLoading?: boolean;
	form: UseAttachProductForm;
}) {
	if (isLoading) {
		return (
			<LoadingShimmerText text="Calculating totals" className="py-4 px-6" />
		);
	}

	return (
		<>
			<UpdateConfirmationInfo
				previewData={previewData}
				product={product}
				form={form}
			/>

			<div className="py-4">
				<AttachProductLineItems previewData={previewData} />
				<AttachProductTotals previewData={previewData} />
			</div>
		</>
	);
}
