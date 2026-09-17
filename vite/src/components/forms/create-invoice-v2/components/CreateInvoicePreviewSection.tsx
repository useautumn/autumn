import { PreviewSection } from "@/components/forms/shared/PreviewSection";
import { SheetSection } from "@/components/v2/sheets/SharedSheetComponents";
import { InfoBox } from "@/views/onboarding2/integrate/components/InfoBox";
import { useCreateInvoiceFormContext } from "../context/CreateInvoiceFormProvider";

export function CreateInvoicePreviewSection() {
	const { previewQuery, requestBody, blockingReason } =
		useCreateInvoiceFormContext();

	if (blockingReason) {
		return (
			<SheetSection withSeparator={false}>
				<InfoBox variant="warning">{blockingReason}</InfoBox>
			</SheetSection>
		);
	}

	return (
		<PreviewSection
			hidden={requestBody === null}
			includeNextCycle={false}
			previewQuery={{
				data: previewQuery.data,
				error: previewQuery.error,
				isLoading: previewQuery.isLoading,
			}}
			showCreditNote={false}
			suppressErrorWhileLoading
		/>
	);
}
