import type { ProductV2 } from "@autumn/shared";
import SmallSpinner from "@/components/general/SmallSpinner";
import { AttachConfirmationInfo } from "./attach-confirmation-info";
import { AttachFeaturePreview } from "./attach-feature-preview";
import { useAttachPreview } from "./use-attach-preview";

export function AttachProductSummary({
	productId,
	products,
	customerId,
}: {
	productId: string;
	products: ProductV2[];
	customerId: string;
}) {
	const { data: previewData, isLoading } = useAttachPreview();

	if (!productId) {
		return null;
	}

	if (isLoading) {
		return (
			<div className="flex items-center justify-center py-6">
				<SmallSpinner />
			</div>
		);
	}

	console.log("previewData", previewData);

	const product = products.find((p) => p.id === productId);

	// Use preview data if available, otherwise calculate from product prices
	const lineItems =
		previewData?.lines?.map((line) => {
			return {
				name: line.description || product?.name || "Unknown",
				total: line.amount,
			};
		}) || [];

	const total = previewData?.total || 0;

	return (
		<div className="space-y-3">
			<div className="space-y-2">
				{lineItems.map((item, index) => (
					<div key={index} className="flex items-center justify-between">
						<div className="text-sm text-foreground">{item.name}</div>
						<div className="text-sm text-foreground">
							${item.total.toFixed(2)}
						</div>
					</div>
				))}
			</div>
			<div className="border-t border-border" />
			<div className="flex items-center justify-between">
				<div className="text-sm font-semibold text-foreground">Total:</div>
				<div className="text-sm font-semibold text-foreground">
					${total.toFixed(2)}
				</div>
			</div>
			<AttachConfirmationInfo />
			<AttachFeaturePreview customerId={customerId} />
		</div>
	);
}
