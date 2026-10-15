import {
	APPROVAL_AREAS,
	type ApprovalAction,
	type ApprovalRule,
} from "@autumn/shared";
import {
	Button,
	Input,
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
	Switch,
} from "@autumn/ui";
import { ChipMultiSelect } from "./ChipMultiSelect";
import { ReadOnlyNotice } from "./ReadOnlyNotice";
import { RuleActionsPicker } from "./RuleActionsPicker";
import { RuleField } from "./RuleField";
import { RuleWhenSection } from "./RuleWhenSection";
import { ruleArea, ruleWhenArea } from "./ruleActions";
import { useApprovalRuleForm } from "./useApprovalRuleForm";
import {
	subjectKey,
	toggleSubject,
	useRuleSubjectGroups,
} from "./useRuleSubjectGroups";

const SCOPE_CAPTION =
	"Once a role has a rule for an action, every request for that action must match one of its rules.";

const required =
	({ message }: { message: string }) =>
	({ value }: { value: string | unknown[] }) =>
		(typeof value === "string" ? value.trim() : value).length > 0
			? undefined
			: message;

export const ApprovalRuleSheet = ({
	rule,
	open,
	onOpenChange,
}: {
	rule: ApprovalRule | null;
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) => {
	const {
		form,
		readOnly,
		isSaving,
		serverIssue,
		whenError,
		rowIssues,
		clearRowIssues,
		changeActions,
	} = useApprovalRuleForm({
		rule,
		onSaved: () => onOpenChange(false),
	});
	const subjectGroups = useRuleSubjectGroups();
	// With no When section to show it on, a `when` issue reads under Can.
	const whenIssueWithoutSection = ({
		actions,
	}: {
		actions: ApprovalAction[];
	}) => (ruleWhenArea({ actions }) ? undefined : serverIssue("when"));

	return (
		<Sheet
			open={open}
			// A save in flight closes this sheet when it lands, so it can't close another one.
			onOpenChange={(next) => !isSaving && onOpenChange(next)}
		>
			<SheetContent side="right" className="!w-full !max-w-[34rem]">
				<SheetHeader>
					<SheetTitle>{rule ? "Edit rule" : "New rule"}</SheetTitle>
					<SheetDescription>Billing → Approvals</SheetDescription>
				</SheetHeader>

				<fieldset
					disabled={readOnly}
					className="flex min-w-0 flex-1 flex-col gap-6 overflow-y-auto px-4 pb-4"
				>
					{readOnly && <ReadOnlyNotice />}
					<form.Field
						name="name"
						validators={{ onSubmit: required({ message: "Name the rule." }) }}
					>
						{(field) => (
							<RuleField
								label="Name"
								error={field.state.meta.errors[0] ?? serverIssue("name")}
							>
								<Input
									aria-label="Name"
									placeholder="Sales trials"
									value={field.state.value}
									onChange={(event) => field.handleChange(event.target.value)}
								/>
							</RuleField>
						)}
					</form.Field>

					<form.Field
						name="subjects"
						validators={{
							onSubmit: required({ message: "Choose who the rule is for." }),
						}}
					>
						{(field) => (
							<RuleField
								label="Who"
								hint="Everyone, roles or members"
								error={field.state.meta.errors[0] ?? serverIssue("subjects")}
							>
								<ChipMultiSelect
									ariaLabel="Who"
									placeholder="Choose people or roles"
									groups={subjectGroups}
									value={field.state.value.map(subjectKey)}
									onToggle={(key) =>
										field.handleChange(
											toggleSubject({ subjects: field.state.value, key }),
										)
									}
								/>
							</RuleField>
						)}
					</form.Field>

					<form.Field
						name="actions"
						validators={{
							onSubmit: required({ message: "Choose at least one action." }),
						}}
					>
						{(field) => {
							const area = ruleArea({ actions: field.state.value });
							return (
								<RuleField
									label="Can"
									hint={area ? APPROVAL_AREAS[area] : undefined}
									error={
										field.state.meta.errors[0] ??
										serverIssue("actions") ??
										whenIssueWithoutSection({ actions: field.state.value })
									}
								>
									<RuleActionsPicker
										actions={field.state.value}
										onChange={(actions) =>
											changeActions({ current: field.state.value, actions })
										}
									/>
									{ruleWhenArea({ actions: field.state.value }) && (
										<p className="text-subtle text-xs">{SCOPE_CAPTION}</p>
									)}
								</RuleField>
							);
						}}
					</form.Field>

					<form.Subscribe selector={(state) => state.values.actions}>
						{(actions) => {
							const area = ruleWhenArea({ actions });
							if (!area || readOnly) return null;
							return (
								<form.Field name="pinned">
									{(pinned) => (
										<form.Field name="groups">
											{(groups) => (
												<RuleWhenSection
													area={area}
													pinned={pinned.state.value}
													groups={groups.state.value}
													issues={rowIssues}
													error={whenError}
													onPinnedChange={(row) => {
														clearRowIssues();
														pinned.handleChange(row);
													}}
													onGroupsChange={(next) => {
														clearRowIssues();
														groups.handleChange(next);
													}}
												/>
											)}
										</form.Field>
									)}
								</form.Field>
							);
						}}
					</form.Subscribe>

					<form.Field name="note">
						{(field) => (
							<RuleField
								label="Note"
								hint="Optional · shown when blocked"
								error={serverIssue("note")}
							>
								<Input
									aria-label="Note"
									placeholder="Trials over 2 months need Finance."
									value={field.state.value}
									onChange={(event) => field.handleChange(event.target.value)}
								/>
							</RuleField>
						)}
					</form.Field>

					<form.Field name="enabled">
						{(field) => (
							<div className="flex items-center justify-between text-sm">
								<span className="font-medium text-foreground">Enabled</span>
								<Switch
									aria-label="Enabled"
									checked={field.state.value}
									onCheckedChange={field.handleChange}
								/>
							</div>
						)}
					</form.Field>
				</fieldset>

				<div className="flex gap-2 border-t px-4 pt-4 pb-4">
					<Button
						variant="secondary"
						className="flex-1"
						onClick={() => onOpenChange(false)}
						disabled={isSaving}
					>
						Close
					</Button>
					{!readOnly && (
						<Button
							variant="primary"
							className="flex-1"
							onClick={() => form.handleSubmit()}
							isLoading={isSaving}
						>
							Save
						</Button>
					)}
				</div>
			</SheetContent>
		</Sheet>
	);
};
