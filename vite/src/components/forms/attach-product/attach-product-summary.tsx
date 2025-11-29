import type { CheckoutResponseV0 } from "@autumn/shared";
import { LoadingShimmerText } from "@/components/v2/LoadingShimmerText";
import { AttachConfirmationInfo } from "./attach-confirmation-info";
import { AttachProductLineItems } from "./attach-product-line-items";
import { AttachProductTotals } from "./attach-product-totals";

export function AttachProductSummary({
	previewData,
	isLoading,
}: {
	previewData?: CheckoutResponseV0 | null;
	isLoading?: boolean;
}) {
	if (isLoading) {
		return (
			<LoadingShimmerText text="Calculating totals" className="py-2 px-6" />
		);
	}

	return (
		<div className="text-sm">
			<AttachConfirmationInfo previewData={previewData} />

			{/* <AttachFeaturePreview previewData={previewData} /> */}
			<div className="py-4">
				<AttachProductLineItems previewData={previewData} />
				<AttachProductTotals previewData={previewData} />
			</div>
		</div>
	);
}
