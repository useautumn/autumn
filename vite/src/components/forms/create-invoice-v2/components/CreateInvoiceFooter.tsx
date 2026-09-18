import { Button } from "@autumn/ui";
import { ReceiptIcon } from "@phosphor-icons/react";
import { SheetFooter } from "@/components/v2/sheets/SharedSheetComponents";
import { useSheetStore } from "@/hooks/stores/useSheetStore";
import { useCreateInvoiceFormContext } from "../context/CreateInvoiceFormProvider";
import { useCreateInvoiceMutation } from "../hooks/useCreateInvoiceMutation";
import { buildCreateInvoiceRequestBody } from "../hooks/useCreateInvoiceRequestBody";

export function CreateInvoiceFooter() {
	const {
		customerId,
		formValues,
		requestBody,
		previewQuery,
		blockingReason,
		catalogItemsByPlanId,
	} = useCreateInvoiceFormContext();
	const closeSheet = useSheetStore((s) => s.closeSheet);

	const mutation = useCreateInvoiceMutation({
		customerId,
		buildRequestBody: () =>
			buildCreateInvoiceRequestBody({
				customerId,
				form: formValues,
				catalogItemsByPlanId,
			}),
		onCreated: closeSheet,
	});

	const nothingToBill = requestBody === null;
	const disabled =
		nothingToBill ||
		blockingReason !== null ||
		previewQuery.isLoading ||
		previewQuery.isError;

	return (
		<SheetFooter className="grid-cols-1 pt-4">
			<Button
				className="w-full"
				disabled={disabled}
				isLoading={mutation.isPending}
				onClick={() => mutation.createInvoice()}
				variant="primary"
			>
				<ReceiptIcon size={16} />
				Create Invoice
			</Button>
		</SheetFooter>
	);
}
