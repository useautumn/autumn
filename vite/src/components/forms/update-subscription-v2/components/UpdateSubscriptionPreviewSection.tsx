import { formatAmount } from "@autumn/shared";
import { PreviewSection } from "@/components/forms/shared/PreviewSection";
import { getPreviewCreditAmount } from "@/components/forms/shared/previewCreditUtils";
import { buildPreviewTotals } from "@/components/forms/shared/utils/buildPreviewTotals";
import { PreviewTotalsBlock } from "@/components/v2/preview-totals/PreviewTotalsBlock";
import { SheetSection } from "@/components/v2/sheets/SharedSheetComponents";
import { InfoBox } from "@/views/onboarding2/integrate/components/InfoBox";
import { useUpdateSubscriptionFormContext } from "../context/UpdateSubscriptionFormProvider";

export function UpdateSubscriptionPreviewSection() {
	const { previewQuery, hasChanges } = useUpdateSubscriptionFormContext();

	const { isLoading, data: previewData } = previewQuery;
	const creditAmount = getPreviewCreditAmount({ previewData });
	const hasCreditIndicator = creditAmount > 0;
	const formattedCreditAmount = hasCreditIndicator
		? formatAmount({
				amount: Number(creditAmount.toFixed(2)),
				currency: previewData?.currency,
				minFractionDigits: 2,
				maxFractionDigits: 2,
				amountFormatOptions: {
					currencyDisplay: "narrowSymbol",
				},
			})
		: null;

	return (
		<PreviewSection
			previewQuery={previewQuery}
			hidden={!hasChanges}
			totals={buildPreviewTotals({
				previewData,
				includeTotalDue: false,
			})}
			above={
				previewData &&
				hasCreditIndicator &&
				!isLoading && (
					<SheetSection withSeparator={false} className="pb-0">
						<InfoBox variant="note">
							This update includes{" "}
							<span className="text-foreground font-medium">
								{formattedCreditAmount}
							</span>{" "}
							in invoice credits.
						</InfoBox>
					</SheetSection>
				)
			}
			below={
				previewData && (
					<SheetSection withSeparator={false}>
						<PreviewTotalsBlock previewData={previewData} />
					</SheetSection>
				)
			}
		/>
	);
}
