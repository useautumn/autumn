import type { InvoiceTemplate } from "@autumn/shared";
import { PlusIcon } from "@phosphor-icons/react";
import { useMutation } from "@tanstack/react-query";
import { AnimatePresence } from "motion/react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/v2/buttons/Button";
import { useInvoiceTemplatesQuery } from "@/hooks/queries/useInvoiceTemplatesQuery";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { InvoiceTemplateDialog } from "./InvoiceTemplateDialog";
import { InvoiceTemplateRow } from "./InvoiceTemplateRow";
import type { InvoiceTemplateForm } from "./invoiceTemplateFormSchema";

interface DialogState {
	open: boolean;
	template: InvoiceTemplate | null;
}

export const InvoiceTemplatesSubsection = () => {
	const axiosInstance = useAxiosInstance();
	const { templates, refetch } = useInvoiceTemplatesQuery();
	const [dialog, setDialog] = useState<DialogState>({
		open: false,
		template: null,
	});
	const { mutateAsync: saveTemplate, isPending: isSaving } = useMutation({
		mutationFn: ({
			id,
			values,
		}: {
			id: string | null;
			values: InvoiceTemplateForm;
		}) =>
			id
				? axiosInstance.patch(`/invoice_templates/${id}`, values)
				: axiosInstance.post("/invoice_templates", values),
		onSuccess: () => refetch(),
	});
	const { mutateAsync: deleteTemplate, isPending: isDeleting } = useMutation({
		mutationFn: (id: string) =>
			axiosInstance.delete(`/invoice_templates/${id}`),
		onSuccess: () => refetch(),
	});
	const closeDialog = () => setDialog({ open: false, template: null });
	const handleSubmit = async (values: InvoiceTemplateForm) => {
		try {
			await saveTemplate({ id: dialog.template?.id ?? null, values });
			closeDialog();
			toast.success(
				dialog.template ? "Invoice template updated" : "Invoice template added",
			);
		} catch {
			toast.error("Failed to save invoice template");
		}
	};
	const handleDelete = async (id: string) => {
		try {
			await deleteTemplate(id);
			toast.success("Invoice template removed");
		} catch {
			toast.error("Failed to remove invoice template");
		}
	};
	return (
		<div className="flex flex-col gap-3">
			<div className="flex items-center justify-between">
				<div className="flex flex-col gap-0.5">
					<span className="text-sm font-medium">Invoice templates</span>
					<span className="text-xs text-muted-foreground">
						Footers with bank details that can be selected when sending an
						invoice
					</span>
				</div>
				<Button
					variant="secondary"
					size="mini"
					className="gap-2 font-medium shrink-0"
					onClick={() => setDialog({ open: true, template: null })}
				>
					<PlusIcon className="size-3.5" />
					Add template
				</Button>
			</div>
			{templates.length === 0 ? (
				<div className="rounded-lg border border-dashed bg-interactive-secondary px-3 py-4 text-center text-xs text-tertiary-foreground">
					No invoice templates configured.
				</div>
			) : (
				<div className="flex flex-col gap-1.5">
					<AnimatePresence initial={false}>
						{templates.map((template) => (
							<InvoiceTemplateRow
								key={template.id}
								template={template}
								onEdit={() => setDialog({ open: true, template })}
								onDelete={() => handleDelete(template.id)}
								isDeleting={isDeleting}
							/>
						))}
					</AnimatePresence>
				</div>
			)}
			{dialog.open && (
				<InvoiceTemplateDialog
					open={dialog.open}
					onOpenChange={(open) => !open && closeDialog()}
					initialTemplate={dialog.template ?? undefined}
					onSubmit={handleSubmit}
					isSaving={isSaving}
				/>
			)}
		</div>
	);
};
