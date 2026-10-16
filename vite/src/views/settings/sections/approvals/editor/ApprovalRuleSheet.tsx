import type { ApprovalRule, ApprovalRuleEffect } from "@autumn/shared";
import {
	Button,
	Input,
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
	Switch,
	Tabs,
	TabsList,
	TabsTrigger,
} from "@autumn/ui";
import { ChipMultiSelect } from "./ChipMultiSelect";
import { RuleActionsPicker } from "./RuleActionsPicker";
import { RuleField } from "./RuleField";
import { areaLabel, ruleArea } from "./ruleActions";
import { useApprovalRuleForm } from "./useApprovalRuleForm";
import {
	subjectKey,
	toggleSubject,
	useRuleSubjectGroups,
} from "./useRuleSubjectGroups";

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
	const { form, isSaving, serverIssue, unplacedIssue, changeActions } =
		useApprovalRuleForm({
			rule,
			onSaved: () => onOpenChange(false),
		});
	const subjectGroups = useRuleSubjectGroups();

	return (
		<Sheet
			open={open}
			// A save in flight closes this sheet when it lands, so it can't close another one.
			onOpenChange={(next) => !isSaving && onOpenChange(next)}
		>
			<SheetContent side="right" className="!w-full !max-w-[30rem]">
				<SheetHeader>
					<SheetTitle>{rule ? "Edit rule" : "New rule"}</SheetTitle>
					<SheetDescription>Billing → Approvals</SheetDescription>
				</SheetHeader>

				<div className="flex flex-1 flex-col gap-6 overflow-y-auto px-4 pb-4">
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

					<form.Field name="effect">
						{(field) => (
							<RuleField label="Can or can't" error={serverIssue("effect")}>
								<Tabs
									value={field.state.value}
									onValueChange={(value: ApprovalRuleEffect) =>
										field.handleChange(value)
									}
								>
									<TabsList className="w-fit">
										<TabsTrigger value="allow">Can</TabsTrigger>
										<TabsTrigger value="block">Can't</TabsTrigger>
									</TabsList>
								</Tabs>
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
									label="Actions"
									hint={area ? areaLabel(area) : undefined}
									error={
										field.state.meta.errors[0] ??
										serverIssue("actions") ??
										serverIssue("filter")
									}
								>
									<RuleActionsPicker
										actions={field.state.value}
										onChange={(actions) =>
											changeActions({ current: field.state.value, actions })
										}
									/>
								</RuleField>
							);
						}}
					</form.Field>

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
				</div>

				{unplacedIssue && (
					<p className="px-4 pb-2 text-destructive text-xs">{unplacedIssue}</p>
				)}
				<div className="flex gap-2 border-t px-4 pt-4 pb-4">
					<Button
						variant="secondary"
						className="flex-1"
						onClick={() => onOpenChange(false)}
						disabled={isSaving}
					>
						Close
					</Button>
					<Button
						variant="primary"
						className="flex-1"
						onClick={() => form.handleSubmit()}
						isLoading={isSaving}
					>
						Save
					</Button>
				</div>
			</SheetContent>
		</Sheet>
	);
};
