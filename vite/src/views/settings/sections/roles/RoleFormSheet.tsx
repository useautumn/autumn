import {
	Button,
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from "@autumn/ui";
import { z } from "zod/v4";
import { ScopeSelector } from "@/components/v2/scope-selector";
import { useAppForm } from "@/hooks/form/form";
import { RulesThatIncludeSection } from "../approvals/RulesThatIncludeSection";
import {
	type ApiRole,
	accessError,
	accessToScopes,
	canEditRole,
	formValuesToRoleBody,
	labelToName,
	type RoleBody,
	roleToFormValues,
	scopesToAccess,
} from "./roleAccess";

const LabelSchema = z
	.string()
	.trim()
	.min(1, "Name is required")
	.refine(
		(label) => labelToName({ label }).length > 0,
		"Use at least one letter or number",
	);

const sheetTitle = ({
	role,
	editable,
}: {
	role: ApiRole | null;
	editable: boolean;
}) => {
	if (!role) return "New role";
	if (editable) return "Edit role";
	return role.label;
};

export const RoleFormSheet = ({
	role,
	open,
	onOpenChange,
	onSubmit,
	isSaving,
	readOnly,
}: {
	role: ApiRole | null;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onSubmit: (params: { body: RoleBody }) => void;
	isSaving: boolean;
	readOnly: boolean;
}) => {
	const editable = !readOnly && (!role || canEditRole({ role }));
	const form = useAppForm({
		defaultValues: roleToFormValues({ role }),
		onSubmit: ({ value }) =>
			onSubmit({ body: formValuesToRoleBody({ values: value }) }),
	});

	return (
		<Sheet open={open} onOpenChange={onOpenChange}>
			<SheetContent
				side="right"
				className="!w-[28rem] !max-w-[28rem] sm:!w-[28rem] sm:!max-w-[28rem]"
			>
				<SheetHeader>
					<SheetTitle>{sheetTitle({ role, editable })}</SheetTitle>
					<SheetDescription>
						{editable
							? "Choose what members with this role can see and edit."
							: "This role can't be changed here."}
					</SheetDescription>
				</SheetHeader>

				<div className="flex flex-col gap-4 overflow-y-auto px-4 pb-4">
					{editable && (
						<form.AppField name="label" validators={{ onSubmit: LabelSchema }}>
							{(field) => (
								<field.TextField
									label="Name"
									type="text"
									placeholder="Account managers"
								/>
							)}
						</form.AppField>
					)}
					<form.Field
						name="access"
						validators={{
							onSubmit: ({ value }) => accessError({ access: value }),
						}}
					>
						{(field) => (
							<div className="flex flex-col gap-2">
								<ScopeSelector
									value={accessToScopes({ access: field.state.value })}
									onChange={(scopes) =>
										field.handleChange(scopesToAccess({ scopes }))
									}
									allowUnrestricted={false}
									disabled={!editable || isSaving}
								/>
								{field.state.meta.errors.length > 0 && (
									<em className="text-destructive text-xs">
										{field.state.meta.errors[0]}
									</em>
								)}
							</div>
						)}
					</form.Field>
					{role && (
						<RulesThatIncludeSection
							audience={{ type: "role", role: role.name }}
							name={role.label}
						/>
					)}
				</div>

				{editable && (
					<div className="flex gap-2 px-4 pt-2 pb-4">
						<Button
							variant="secondary"
							className="flex-1"
							onClick={() => onOpenChange(false)}
							disabled={isSaving}
						>
							Cancel
						</Button>
						<Button
							variant="primary"
							className="flex-1"
							onClick={() => form.handleSubmit()}
							isLoading={isSaving}
						>
							{role ? "Save" : "Create role"}
						</Button>
					</div>
				)}
			</SheetContent>
		</Sheet>
	);
};
