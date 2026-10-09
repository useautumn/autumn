import { Button, GroupedTabButton, Input, TagInput } from "@autumn/ui";
import { ArrowSquareOutIcon } from "@phosphor-icons/react";
import { FieldInfo } from "@/components/general/form/field-info";
import { AtomFieldRow } from "./AtomFieldRow";
import { type AtomSectionState, AtomSetupSection } from "./AtomSetupSection";
import type { AtomSetupForm, AtomSetupValues } from "./useAtomSetupForm";

const VPC_OPTIONS = [
	{ value: "existing_vpc", label: "Existing VPC" },
	{ value: "new_vpc", label: "New VPC" },
];

const VPC_HINTS: Record<AtomSetupValues["vpc"], string> = {
	existing_vpc: "Your app reaches Atom privately from inside this VPC.",
	new_vpc:
		"Your app reaches Atom over the internet with its URL and your secret key.",
};

const VPC_SUMMARIES: Record<AtomSetupValues["vpc"], string> = {
	existing_vpc: "Existing VPC · Private",
	new_vpc: "New VPC · Public",
};

/** Step 2: the network Atom joins, then the AWS stack that creates it. */
export const AtomAccountSection = ({
	form,
	state,
	stackName,
	hasSetupLink,
	onEdit,
	onCancel,
}: {
	form: AtomSetupForm;
	state: AtomSectionState;
	stackName: string;
	/** A link was already handed out, so submitting replaces it. */
	hasSetupLink: boolean;
	onEdit: () => void;
	onCancel: () => void;
}) => (
	<form.Subscribe
		selector={(formState) =>
			[formState.values.vpc, formState.isSubmitting] as const
		}
	>
		{([vpc, isSubmitting]) => (
			<AtomSetupSection
				step={2}
				title="Account setup"
				state={state}
				summary={VPC_SUMMARIES[vpc]}
				onEdit={onEdit}
				footer={
					<>
						<Button variant="secondary" onClick={onCancel}>
							Cancel
						</Button>
						<Button
							variant="primary"
							isLoading={isSubmitting}
							onClick={() => form.handleSubmit()}
						>
							{hasSetupLink ? "Update AWS link" : "Create stack in AWS"}
							<ArrowSquareOutIcon className="size-3.5" />
						</Button>
					</>
				}
			>
				<AtomFieldRow label="VPC" isMuted>
					<form.Field name="vpc">
						{(field) => (
							<div className="flex flex-col gap-1.5 py-1">
								<GroupedTabButton
									value={field.state.value}
									onValueChange={(value) =>
										field.handleChange(value as AtomSetupValues["vpc"])
									}
									options={VPC_OPTIONS}
									className="w-64"
								/>
								<span className="text-xs text-tertiary-foreground">
									{VPC_HINTS[field.state.value]}
								</span>
							</div>
						)}
					</form.Field>
				</AtomFieldRow>
				{vpc === "existing_vpc" && (
					<>
						<AtomFieldRow label="VPC ID" isMuted>
							<form.Field name="vpcId">
								{(field) => (
									<div className="flex w-64 flex-col gap-1">
										<Input
											aria-label="VPC ID"
											className="font-mono text-xs"
											placeholder="vpc-0a1b2c3d4e5f6a7b8"
											value={field.state.value}
											onChange={(event) =>
												field.handleChange(event.target.value)
											}
										/>
										<FieldInfo field={field} />
									</div>
								)}
							</form.Field>
						</AtomFieldRow>
						<AtomFieldRow label="Subnets" isMuted>
							<form.Field name="subnetIds">
								{(field) => (
									<div className="flex w-full max-w-md flex-col gap-1">
										<TagInput
											aria-label="Subnet IDs"
											className="font-mono text-xs"
											placeholder="subnet-0aa1"
											value={field.state.value}
											onChange={field.handleChange}
										/>
										<FieldInfo field={field} />
									</div>
								)}
							</form.Field>
						</AtomFieldRow>
					</>
				)}
				<AtomFieldRow label="Stack" isMuted>
					<span className="font-mono text-xs">{stackName}</span>
					<span className="text-xs text-subtle">Set by Autumn</span>
				</AtomFieldRow>
			</AtomSetupSection>
		)}
	</form.Subscribe>
);
