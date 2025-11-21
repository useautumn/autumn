import { AttachProductForm } from "@/components/forms/attach-product/attach-product-form";
import { SheetHeader, SheetSection } from "@/components/v2/sheets/InlineSheet";
import { useCustomerContext } from "../../customer/CustomerContext";

export function AttachProductSheet() {
	const { customer } = useCustomerContext();

	return (
		<div className="flex flex-col h-full">
			<SheetHeader
				title="Attach Product"
				description="Select and configure a product to attach to this customer"
			/>

			<div className="flex-1 overflow-y-auto">
				<SheetSection title="Product Selection" withSeparator={false}>
					<AttachProductForm customerId={customer.id} />
				</SheetSection>
			</div>
		</div>
	);
}
