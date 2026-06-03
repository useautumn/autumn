import type { InvoiceTemplate } from "@autumn/shared";
import { FieldInfo } from "@/components/general/form/field-info";
import { Button } from "@/components/v2/buttons/Button";
import {
	Dialog,
	DialogContent,
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
	onSubmit: (values: InvoiceTemplateForm) => Promise<void>;
	isSaving: boolean;
}) => {
	const isEdit = initialTemplate !== undefined;
	const form = useAppForm({
		defaultValues: {
			name: initialTemplate?.name ?? "",
			footer: initialTemplate?.footer ?? "",
		} as InvoiceTemplateForm,
		validators: { onChange: InvoiceTemplateFormSchema },
		onSubmit: async ({ value }) =>
			onSubmit({ name: value.name.trim(), footer: value.footer.trim() }),
	});
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-md">
				<DialogHeader>
					<DialogTitle>
						{isEdit ? "Edit invoice template" : "Add invoice template"}
					</DialogTitle>
				</DialogHeader>
				<form
					className="flex flex-col gap-4"
					onSubmit={(e) => {
						e.preventDefault();
						form.handleSubmit();
					}}
				>
					<form.Field name="name">
						{(field) => (
							<div>
								<FormLabel>Name</FormLabel>
								<Input
									placeholder="e.g. EU Bank Details"
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
									placeholder="Bank details shown in the invoice footer so customers can pay directly"
									value={field.state.value}
									onBlur={field.handleBlur}
									onChange={(e) => field.handleChange(e.target.value)}
								/>
								<FieldInfo field={field} />
							</div>
						)}
					</form.Field>
					<DialogFooter>
						<Button
							type="button"
							variant="secondary"
							onClick={() => onOpenChange(false)}
							disabled={isSaving}
						>
							Cancel
						</Button>
						<form.Subscribe selector={(state) => state.canSubmit}>
							{(canSubmit) => (
								<Button
									type="submit"
									variant="primary"
									isLoading={isSaving}
									disabled={!canSubmit}
								>
									{isEdit ? "Save" : "Add"}
								</Button>
							)}
						</form.Subscribe>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
};
