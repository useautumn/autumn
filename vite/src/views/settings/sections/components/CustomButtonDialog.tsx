import type { CustomButton } from "@autumn/shared";
import { FieldInfo } from "@/components/general/form/field-info";
import { Switch } from "@/components/ui/switch";
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
import { useAppForm } from "@/hooks/form/form";
import {
	type CustomButtonForm,
	CustomButtonFormSchema,
} from "./customButtonFormSchema";

export const CustomButtonDialog = ({
	open,
	onOpenChange,
	initialButton,
	onSubmit,
	isSaving,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	initialButton?: CustomButton;
	onSubmit: (values: CustomButtonForm) => void;
	isSaving: boolean;
}) => {
	const isEdit = initialButton !== undefined;
	const form = useAppForm({
		defaultValues: {
			label: initialButton?.label ?? "",
			url: initialButton?.url ?? "",
			open_in_new_tab: initialButton?.open_in_new_tab ?? true,
		} as CustomButtonForm,
		validators: { onChange: CustomButtonFormSchema },
		onSubmit: ({ value }) =>
			onSubmit({
				label: value.label.trim(),
				url: value.url.trim(),
				open_in_new_tab: value.open_in_new_tab,
			}),
	});
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-md">
				<DialogHeader>
					<DialogTitle>
						{isEdit ? "Edit custom button" : "Add custom button"}
					</DialogTitle>
					<DialogDescription>
						Renders on every customer page, linking out to your own tools.
					</DialogDescription>
				</DialogHeader>
				<div className="flex flex-col gap-4">
					<form.Field name="label">
						{(field) => (
							<div>
								<FormLabel>Label</FormLabel>
								<Input
									placeholder="Internal dashboard"
									value={field.state.value}
									onBlur={field.handleBlur}
									onChange={(e) => field.handleChange(e.target.value)}
								/>
								<FieldInfo field={field} />
							</div>
						)}
					</form.Field>
					<form.Field name="url">
						{(field) => (
							<div>
								<FormLabel>URL</FormLabel>
								<Input
									placeholder="https://internal.firecrawl.dev/{customerId}"
									value={field.state.value}
									onBlur={field.handleBlur}
									onChange={(e) => field.handleChange(e.target.value)}
								/>
								<p className="mt-1.5 text-xs text-tertiary-foreground">
									Use{" "}
									<code className="rounded bg-interactive-secondary px-1 py-0.5 font-mono text-purple-500">
										{"{customerId}"}
									</code>{" "}
									to insert the customer's ID.
								</p>
								<FieldInfo field={field} />
							</div>
						)}
					</form.Field>
					<form.Field name="open_in_new_tab">
						{(field) => (
							<div className="flex items-center justify-between">
								<FormLabel className="mb-0">Open in new tab</FormLabel>
								<Switch
									checked={field.state.value}
									onCheckedChange={(value) => field.handleChange(value)}
								/>
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
