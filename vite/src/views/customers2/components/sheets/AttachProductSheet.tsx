import { SheetHeader, SheetSection } from "@/components/v2/sheets/InlineSheet";

export function AttachProductSheet() {
	return (
		<div className="flex flex-col h-full">
			<SheetHeader
				title="Attach Product"
				description="Select and configure a product to attach to this customer"
			/>

			<div className="flex-1 overflow-y-auto">
				<SheetSection title="Product Selection" withSeparator={false}>
					{/* TODO: Add product selection and configuration form */}
					<p className="text-sm text-t3">Form content goes here</p>
				</SheetSection>
			</div>
		</div>
	);
}
