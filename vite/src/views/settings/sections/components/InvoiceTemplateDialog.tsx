import type { InvoiceTemplate } from "@autumn/shared";
import { FieldInfo } from "@/components/general/form/field-info";
import { ShortcutButton } from "@/components/v2/buttons/ShortcutButton";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/v2/dialogs/Dialog";
import { FormLabel } from "@/components/v2/form/FormLabel";
import { Input } from "@/components/v2/inputs/Input";
import { LongInput } from "@/components/v2/inputs/LongInput";
import { useAppForm } from "@/hooks/form/form";
import {
	type InvoiceTemplateForm,
	InvoiceTemplateFormSchema,
} from "./invoiceTemplateFormSchema";

export const InvoiceTemplateDialog = ({
	open,
	onOpenChange,
	initialTemplate,
	onSubmit,
	isSaving,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	initialTemplate?: InvoiceTemplate;
	onSubmit: (values: InvoiceTemplateForm) => void;
	isSaving: boolean;
}) => {
	const isEdit = initialTemplate !== undefined;
	const form = useAppForm({
		defaultValues: {
			name: initialTemplate?.name ?? "",
			footer: initialTemplate?.footer ?? "",
			memo: initialTemplate?.memo ?? "",
			net_terms_days: initialTemplate?.net_terms_days,
		} as InvoiceTemplateForm,
		validators: { onChange: InvoiceTemplateFormSchema },
		onSubmit: async ({ value }) =>
			onSubmit({
				name: value.name.trim(),
				footer: value.footer?.trim() ? value.footer.trim() : undefined,
				memo: value.memo?.trim() ? value.memo.trim() : undefined,
				net_terms_days: value.net_terms_days,
			}),
	});
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-md">
				<DialogHeader>
					<DialogTitle>
						{isEdit ? "Edit invoice template" : "Add invoice template"}
					</DialogTitle>
					<DialogDescription>
						Applies preset invoice fields when sending an invoice.
					</DialogDescription>
				</DialogHeader>
				<div className="flex flex-col gap-4">
					<form.Field name="name">
						{(field) => (
							<div>
								<FormLabel>Name</FormLabel>
								<Input
									placeholder="EU Bank Details"
									value={field.state.value}
									onBlur={field.handleBlur}
									onChange={(e) => field.handleChange(e.target.value)}
								/>
								<FieldInfo field={field} />
							</div>
						)}
					</form.Field>
					<form.Field name="footer">
						{(field) => (
							<div>
								<FormLabel>Footer</FormLabel>
								<LongInput
									placeholder={
										"Routing number: 091311229\nAccount number: 202420250213"
									}
									value={field.state.value ?? ""}
									onBlur={field.handleBlur}
									onChange={(e) => field.handleChange(e.target.value)}
								/>
								<FieldInfo field={field} />
							</div>
						)}
					</form.Field>
					<form.Field name="memo">
						{(field) => (
							<div>
								<FormLabel>Memo</FormLabel>
								<Input
									placeholder="Questions? Email finance@acme.com"
									value={field.state.value ?? ""}
									onBlur={field.handleBlur}
									onChange={(e) => field.handleChange(e.target.value)}
								/>
								<FieldInfo field={field} />
							</div>
						)}
					</form.Field>
					<form.Field name="net_terms_days">
						{(field) => (
							<div>
								<FormLabel>Net payment terms (days)</FormLabel>
								<Input
									type="number"
									min={1}
									placeholder="30"
									value={field.state.value ?? ""}
									onBlur={field.handleBlur}
									onChange={(e) => {
										const parsed = Number.parseInt(e.target.value, 10);
										field.handleChange(
											Number.isNaN(parsed) ? undefined : parsed,
										);
									}}
								/>
								<FieldInfo field={field} />
							</div>
						)}
					</form.Field>
				</div>
				<DialogFooter>
					<form.Subscribe selector={(state) => state.canSubmit}>
						{(canSubmit) => (
							<ShortcutButton
								variant="primary"
								className="w-full"
								onClick={() => form.handleSubmit()}
								metaShortcut="enter"
								isLoading={isSaving}
								disabled={!canSubmit}
							>
								{isEdit ? "Save" : "Add"}
							</ShortcutButton>
						)}
					</form.Subscribe>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
};
