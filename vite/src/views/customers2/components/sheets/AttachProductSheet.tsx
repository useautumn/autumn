import { useEffect } from "react";
import { AttachProductForm } from "@/components/forms/attach-product/attach-product-form";
import { SheetHeader, SheetSection } from "@/components/v2/sheets/InlineSheet";
import { useProductStore } from "@/hooks/stores/useProductStore";
import { useSheetStore } from "@/hooks/stores/useSheetStore";
import { useCustomerContext } from "../../customer/CustomerContext";

export function AttachProductSheet() {
	const { customer } = useCustomerContext();
	const sheetType = useSheetStore((s) => s.type);
	const resetProductStore = useProductStore((s) => s.reset);
	//remove any stale customized product data from store
	useEffect(() => {
		if (sheetType !== "attach-product") {
			resetProductStore();
		}
	}, [sheetType, resetProductStore]);

	return (
		<div className="flex flex-col h-full">
			<SheetHeader
				title="Attach Product"
				description="Select and configure a product to attach to this customer"
			/>

			<div className="flex-1 overflow-y-auto">
				<SheetSection title="Product Selection" withSeparator={false}>
					<AttachProductForm customerId={customer?.id ?? ""} />
				</SheetSection>
			</div>
		</div>
	);
}
