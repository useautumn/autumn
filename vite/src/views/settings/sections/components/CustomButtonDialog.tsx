import type { CustomButton } from "@autumn/shared";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	FormLabel,
	Input,
	ShortcutButton,
	Switch,
} from "@autumn/ui";
import { FieldInfo } from "@/components/general/form/field-info";
import { DEFAULT_PHOSPHOR_ICON } from "@/components/v2/icons/phosphorIcons";
import { useAppForm } from "@/hooks/form/form";
import {
	type CustomButtonForm,
	CustomButtonFormSchema,
} from "./customButtonFormSchema";
import { IconPicker } from "./IconPicker";

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
			icon: initialButton?.icon ?? DEFAULT_PHOSPHOR_ICON,
			url: initialButton?.url ?? "",
			open_in_new_tab: initialButton?.open_in_new_tab ?? true,
		} as CustomButtonForm,
		validators: { onChange: CustomButtonFormSchema },
		onSubmit: ({ value }) =>
			onSubmit({
				label: value.label.trim(),
				icon: value.icon,
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
				<form.Subscribe selector={(state) => state.submissionAttempts > 0}>
					{(submitted) => (
						<div className="flex flex-col gap-4">
							<div className="flex items-start gap-2">
								<form.Field name="icon">
									{(field) => (
										<div className="flex flex-col">
											<FormLabel>Icon</FormLabel>
											<IconPicker
												value={field.state.value}
												onChange={(name) => field.handleChange(name)}
											/>
										</div>
									)}
								</form.Field>
								<form.Field name="label">
									{(field) => (
										<div className="flex flex-1 flex-col">
											<FormLabel>Label</FormLabel>
											<Input
												placeholder="Internal dashboard"
												value={field.state.value}
												onBlur={field.handleBlur}
												onChange={(e) => field.handleChange(e.target.value)}
											/>
											{submitted && <FieldInfo field={field} />}
										</div>
									)}
								</form.Field>
							</div>
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
											or{" "}
											<code className="rounded bg-interactive-secondary px-1 py-0.5 font-mono text-purple-500">
												{"{customerEmail}"}
											</code>{" "}
											to insert customer details.
										</p>
										{submitted && <FieldInfo field={field} />}
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
					)}
				</form.Subscribe>
				<DialogFooter>
					<ShortcutButton
						variant="primary"
						className="w-full"
						onClick={() => form.handleSubmit()}
						metaShortcut="enter"
						isLoading={isSaving}
					>
						{isEdit ? "Save" : "Add"}
					</ShortcutButton>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
};
