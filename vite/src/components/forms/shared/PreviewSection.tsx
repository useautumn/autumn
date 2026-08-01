import type { AxiosError } from "axios";
import type { ComponentProps, ReactNode } from "react";
import { LineItemsPreview } from "@/components/v2/LineItemsPreview";
import { SheetSection } from "@/components/v2/sheets/SharedSheetComponents";
import { getBackendErr } from "@/utils/genUtils";
import { PreviewErrorDisplay } from "./PreviewErrorDisplay";
import type { PreviewTotal } from "./utils/buildPreviewTotals";

const TITLE = "Pricing Preview";

type PreviewLineItems = ComponentProps<typeof LineItemsPreview>["lineItems"];

/** Loose enough to accept both the attach and update preview responses. */
type PreviewQuery = {
	isLoading: boolean;
	data:
		| ({ currency?: string; line_items?: PreviewLineItems } & object)
		| null
		| undefined;
	error: unknown;
};

/** Shared loading/error envelope around the pricing preview. */
export function PreviewSection({
	previewQuery,
	totals,
	hidden = false,
	isLoading,
	lineItems,
	filterZeroAmounts = true,
	suppressErrorWhileLoading = false,
	above,
	below,
}: {
	previewQuery: PreviewQuery;
	totals: PreviewTotal[];
	/** Nothing to preview yet — render nothing at all. */
	hidden?: boolean;
	/** Override when the flow has extra loading state of its own. */
	isLoading?: boolean;
	/** Defaults to the response's line items. */
	lineItems?: PreviewLineItems;
	filterZeroAmounts?: boolean;
	/** Keep the last preview on screen through a refetch instead of flashing the error. */
	suppressErrorWhileLoading?: boolean;
	above?: ReactNode;
	below?: ReactNode;
}) {
	const { data: previewData, error: queryError } = previewQuery;
	const error = queryError
		? getBackendErr(queryError as AxiosError, "Failed to load preview")
		: undefined;
	const loading = isLoading ?? previewQuery.isLoading;

	if (hidden) return null;

	if (error && !(suppressErrorWhileLoading && loading)) {
		return (
			<SheetSection title={TITLE} withSeparator>
				<PreviewErrorDisplay error={error} />
			</SheetSection>
		);
	}

	return (
		<>
			{above}
			<LineItemsPreview
				title={TITLE}
				isLoading={loading}
				lineItems={lineItems ?? previewData?.line_items}
				currency={previewData?.currency}
				totals={totals}
				filterZeroAmounts={filterZeroAmounts}
			/>
			{below}
		</>
	);
}
