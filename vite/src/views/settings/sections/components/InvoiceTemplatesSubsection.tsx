import type { InvoiceTemplate } from "@autumn/shared";
import { PlusIcon } from "@phosphor-icons/react";
import { AnimatePresence } from "motion/react";
import { useState } from "react";
import { Button } from "@/components/v2/buttons/Button";
import { DeleteInvoiceTemplateDialog } from "./DeleteInvoiceTemplateDialog";
import { InvoiceTemplateDialog } from "./InvoiceTemplateDialog";
import { InvoiceTemplateRow } from "./InvoiceTemplateRow";
import type { InvoiceTemplateForm } from "./invoiceTemplateFormSchema";
import { useInvoiceTemplates } from "./useInvoiceTemplates";

interface DialogState {
	open: boolean;
	template: InvoiceTemplate | null;
	nonce: number;
}

interface DeleteDialogState {
	open: boolean;
	template: InvoiceTemplate | null;
}

export const InvoiceTemplatesSubsection = () => {
	const { templates, save, remove } = useInvoiceTemplates();
	const [dialog, setDialog] = useState<DialogState>({
		open: false,
		template: null,
		nonce: 0,
	});
	const [deleteDialog, setDeleteDialog] = useState<DeleteDialogState>({
		open: false,
		template: null,
	});
	const openDialog = (template: InvoiceTemplate | null) =>
		setDialog((prev) => ({ open: true, template, nonce: prev.nonce + 1 }));
	const handleSubmit = (values: InvoiceTemplateForm) =>
		save.mutate(
			{ id: dialog.template?.id ?? null, values },
			{ onSuccess: () => setDialog((prev) => ({ ...prev, open: false })) },
		);
	const handleDelete = () => {
		if (!deleteDialog.template) return;
		remove.mutate(deleteDialog.template.id, {
			onSuccess: () => setDeleteDialog((prev) => ({ ...prev, open: false })),
		});
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
					onClick={() => openDialog(null)}
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
								onEdit={() => openDialog(template)}
								onDelete={() => setDeleteDialog({ open: true, template })}
								isDeleting={
									remove.isPending && deleteDialog.template?.id === template.id
								}
							/>
						))}
					</AnimatePresence>
				</div>
			)}
			<InvoiceTemplateDialog
				key={`${dialog.template?.id ?? "new"}-${dialog.nonce}`}
				open={dialog.open}
				onOpenChange={(open) => setDialog((prev) => ({ ...prev, open }))}
				initialTemplate={dialog.template ?? undefined}
				onSubmit={handleSubmit}
				isSaving={save.isPending}
			/>
			<DeleteInvoiceTemplateDialog
				template={deleteDialog.template}
				open={deleteDialog.open}
				onOpenChange={(open) => setDeleteDialog((prev) => ({ ...prev, open }))}
				onConfirm={handleDelete}
				isDeleting={remove.isPending}
			/>
		</div>
	);
};
