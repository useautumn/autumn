import type { CheckoutResponseV0 } from "@autumn/shared";
import {
	SheetAccordion,
	SheetAccordionItem,
} from "@/components/v2/sheets/SheetAccordion";

export function AttachProductLineItems({
	previewData,
}: {
	previewData?: CheckoutResponseV0 | null;
}) {
	const lineItems =
		previewData?.lines?.map((line) => {
			return {
				name: line.description || "Unknown",
				total: line.amount,
			};
		}) || [];

	if (lineItems.length === 0) {
		return null;
	}

	return (
		<SheetAccordion type="single" withSeparator={false} collapsible={true}>
			<SheetAccordionItem
				value="line-items"
				title="Line Items"
				className="text-t3 "
			>
				<div className="space-y-2">
					{lineItems.map((item, index) => (
						<div key={index} className="flex items-center justify-between">
							<span className="text-sm truncate max-w-75 text-t3">
								{item.name}
							</span>
							<span className="text-sm text-t1 font-semibold truncate w-20 text-right">
								${item.total.toFixed(2)}
							</span>
						</div>
					))}
				</div>
			</SheetAccordionItem>
		</SheetAccordion>
	);
}
