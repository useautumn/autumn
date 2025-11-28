import type { CheckoutResponseV0, ProductV2 } from "@autumn/shared";
import SmallSpinner from "@/components/general/SmallSpinner";
import { Separator } from "@/components/v2/separator";
import {
	SheetAccordion,
	SheetAccordionItem,
} from "@/components/v2/sheets/SheetAccordion";
import { formatUnixToDate } from "@/utils/formatUtils/formatDateUtils";
import { UpdateConfirmationInfo } from "./update-confirmation-info";
import type { UseAttachProductForm } from "./use-attach-product-form";

export function UpdateProductSummary({
	product,
	previewData,
	isLoading,
	form,
}: {
	product?: ProductV2;
	previewData?: CheckoutResponseV0 | null;
	isLoading?: boolean;
	form: UseAttachProductForm;
}) {
	if (isLoading) {
		return (
			<div className="flex items-center justify-center py-6">
				<SmallSpinner />
			</div>
		);
	}

	console.log("previewData", previewData);
	// Use preview data if available, otherwise calculate from product prices
	const lineItems =
		previewData?.lines?.map((line) => {
			return {
				name: line.description || product?.name || "Unknown",
				total: line.amount,
			};
		}) || [];

	const total = previewData?.total || 0;
	const nextCycleTotal = previewData?.next_cycle?.total || 0;
	const nextCycleStartsAt = formatUnixToDate(
		previewData?.next_cycle?.starts_at || 0,
	);

	return (
		<div className="space-y-3 text-sm">
			<UpdateConfirmationInfo
				previewData={previewData}
				product={product}
				form={form}
			/>

			<Separator />
			<SheetAccordion type="single" withSeparator={false} collapsible={true}>
				{lineItems.length > 0 && (
					<SheetAccordionItem value="line-items" title="Line Items">
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
					</SheetAccordionItem>
				)}
			</SheetAccordion>
			<div className="flex items-center justify-between text-base">
				<div className="font-medium text-foreground">Total</div>
				<div className="font-semibold text-foreground">${total.toFixed(2)}</div>
			</div>
			<div className="flex items-center justify-between">
				<div className="font-medium text-t4">
					Next Cycle ({nextCycleStartsAt})
				</div>
				<div className="font-semibold text-t4">
					${nextCycleTotal.toFixed(2)}
				</div>
			</div>
		</div>
	);
}
