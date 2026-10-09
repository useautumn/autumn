import {
	Button,
	GroupedTabButton,
	Input,
	InputGroup,
	InputGroupAddon,
	InputGroupInput,
	InputGroupText,
} from "@autumn/ui";
import { ArrowSquareOutIcon } from "@phosphor-icons/react";
import { FieldInfo } from "@/components/general/form/field-info";
import { AtomFieldRow } from "./AtomFieldRow";
import { AtomSetupSection } from "./AtomSetupSection";
import { ATOM_NETWORKS } from "./atomNetworkDisplay";
import type { AtomSetupForm, AtomSetupValues } from "./useAtomSetupForm";

const VPC_OPTIONS = [
	{ value: "new_vpc", label: "New VPC" },
	{ value: "existing_vpc", label: "Existing VPC" },
];

/** Step 2: the network Atom joins, then the AWS stack that creates it. */
export const AtomAccountSection = ({
	form,
	stackNameSuffix,
	hasSetupLink,
	onBack,
	onCancel,
	isCancelling,
}: {
	form: AtomSetupForm;
	stackNameSuffix: string;
	/** A link was already handed out, so submitting replaces it and cancelling removes it. */
	hasSetupLink: boolean;
	onBack: () => void;
	onCancel: () => void;
	isCancelling: boolean;
}) => (
	<form.Subscribe
		selector={(formState) =>
			[formState.values.vpc, formState.isSubmitting] as const
		}
	>
		{([vpc, isSubmitting]) => (
			<AtomSetupSection
				status={
					<Button variant="secondary" onClick={onBack}>
						Back
					</Button>
				}
				actions={
					<>
						{hasSetupLink && (
							<Button
								variant="secondary"
								onClick={onCancel}
								isLoading={isCancelling}
							>
								Cancel setup
							</Button>
						)}
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
									className="w-80"
								/>
								<span className="text-xs text-tertiary-foreground">
									{ATOM_NETWORKS[field.state.value].hint}
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
									<div className="flex w-80 flex-col gap-1">
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
							<form.Field name="subnets">
								{(field) => (
									<div className="flex w-80 flex-col gap-1">
										<Input
											aria-label="Subnet IDs"
											className="font-mono text-xs"
											placeholder="subnet-0aa1, subnet-0bb2"
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
					</>
				)}
				<AtomFieldRow label="Stack name" isMuted>
					<form.Field name="stackName">
						{(field) => (
							<div className="flex w-80 flex-col gap-1">
								<InputGroup>
									<InputGroupInput
										aria-label="Stack name"
										className="text-ellipsis font-mono text-xs"
										value={field.state.value}
										onChange={(event) => field.handleChange(event.target.value)}
									/>
									<InputGroupAddon align="inline-end" className="shrink-0 pl-0">
										<InputGroupText className="font-mono text-xs font-normal text-subtle">
											-{stackNameSuffix}
										</InputGroupText>
									</InputGroupAddon>
								</InputGroup>
								<FieldInfo field={field} />
							</div>
						)}
					</form.Field>
				</AtomFieldRow>
			</AtomSetupSection>
		)}
	</form.Subscribe>
);
