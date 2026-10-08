import { LoadingShimmerText } from "@autumn/ui";
import { useOrg } from "@/hooks/common/useOrg";
import { useInvoiceTemplatesQuery } from "@/hooks/queries/useInvoiceTemplatesQuery";
import { useRewardsQuery } from "@/hooks/queries/useRewardsQuery";
import { cn } from "@/lib/utils";
import { useCusQuery } from "@/views/customers/customer/hooks/useCusQuery";
import { useCreateInvoiceFormContext } from "../context/CreateInvoiceFormProvider";
import { invoiceDiscountRows } from "../utils/invoiceDiscountRows";
import { InvoicePreviewDocument } from "./InvoicePreviewDocument";

export function CreateInvoicePreviewColumn() {
	const { previewQuery, formValues } = useCreateInvoiceFormContext();
	const { customer } = useCusQuery();
	const { org } = useOrg();
	const { templates } = useInvoiceTemplatesQuery();
	const { rewards } = useRewardsQuery();

	const template = templates.find(
		(candidate) => candidate.id === formValues.invoiceTemplateId,
	);
	const preview = previewQuery.data;
	const discountRows = preview
		? invoiceDiscountRows({
				discounts: formValues.discounts,
				rewardsById: new Map(rewards.map((reward) => [reward.id, reward])),
				subtotal: preview.subtotal,
				discountTotal: preview.discount_total,
			})
		: [];

	return (
		<div className="hidden h-full min-h-0 min-w-0 flex-1 flex-col overflow-y-auto border-border/40 border-r bg-card md:flex">
			<div className="shrink-0 px-6 pt-6 pb-4">
				<h2 className="font-semibold text-base text-foreground">
					Preview Invoice
				</h2>
				<p className="mt-1 text-sm text-tertiary-foreground">
					What your customer receives
				</p>
			</div>

			{preview ? (
				<div
					className={cn(
						"shrink-0 px-6 pb-6 transition-opacity duration-200",
						previewQuery.isLoading ? "opacity-55" : "opacity-100",
					)}
				>
					<InvoicePreviewDocument
						billedTo={customer?.name || customer?.id || "Customer"}
						discountRows={discountRows}
						billedToEmail={customer?.email ?? undefined}
						footer={template?.footer}
						issuerName={org?.name ?? "Your company"}
						memo={template?.memo}
						preview={preview}
					/>
				</div>
			) : (
				<div className="flex flex-1 items-center justify-center pb-6">
					{previewQuery.isLoading ? (
						<LoadingShimmerText text="Generating Preview" />
					) : (
						<span className="text-sm text-tertiary-foreground">
							Add a plan or charge to preview the invoice
						</span>
					)}
				</div>
			)}
		</div>
	);
}
