import { CreateInvoiceAdvancedSection } from "@/components/forms/create-invoice-v2/components/CreateInvoiceAdvancedSection";
import { CreateInvoiceFooter } from "@/components/forms/create-invoice-v2/components/CreateInvoiceFooter";
import { CreateInvoicePlansSection } from "@/components/forms/create-invoice-v2/components/CreateInvoicePlansSection";
import { CreateInvoicePreviewSection } from "@/components/forms/create-invoice-v2/components/CreateInvoicePreviewSection";
import {
	CreateInvoiceFormProvider,
	useCreateInvoiceFormContext,
} from "@/components/forms/create-invoice-v2/context/CreateInvoiceFormProvider";
import { InlinePlanEditor } from "@/components/v2/inline-custom-plan-editor/InlinePlanEditor";
import {
	LayoutGroup,
	SheetHeader,
} from "@/components/v2/sheets/SharedSheetComponents";

function CreateInvoiceSheetContent() {
	const { planEditor } = useCreateInvoiceFormContext();

	return (
		<LayoutGroup>
			<div className="flex h-full flex-col overflow-y-auto">
				<SheetHeader
					description="Bill catalog pricing and one-off charges without changing plans, balances or subscriptions."
					title="Create Invoice"
				/>

				<CreateInvoicePlansSection />
				<CreateInvoiceAdvancedSection />
				<CreateInvoicePreviewSection />

				<CreateInvoiceFooter />
			</div>

			{planEditor.planEditorProduct && (
				<InlinePlanEditor
					isOpen={planEditor.showPlanEditor}
					onCancel={planEditor.handlePlanEditorCancel}
					onSave={planEditor.handlePlanEditorSave}
					product={planEditor.planEditorProduct}
				/>
			)}
		</LayoutGroup>
	);
}

export function CreateInvoiceSheet() {
	return (
		<CreateInvoiceFormProvider>
			<CreateInvoiceSheetContent />
		</CreateInvoiceFormProvider>
	);
}
