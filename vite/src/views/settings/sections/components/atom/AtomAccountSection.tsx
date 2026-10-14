import {
	Button,
	InputGroup,
	InputGroupAddon,
	InputGroupInput,
	InputGroupText,
} from "@autumn/ui";
import { ArrowSquareOutIcon } from "@phosphor-icons/react";
import { FieldInfo } from "@/components/general/form/field-info";
import { AtomFieldRow } from "./AtomFieldRow";
import { ATOM_NETWORK_FIELDS, AtomNetworkFields } from "./AtomNetworkFields";
import { AtomSetupSection } from "./AtomSetupSection";
import type { AtomSetupForm } from "./useAtomSetupForm";

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
	hasSetupLink: boolean;
	onBack: () => void;
	onCancel: () => void;
	isCancelling: boolean;
}) => (
	<form.Subscribe selector={(formState) => formState.isSubmitting}>
		{(isSubmitting) => (
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
				<AtomNetworkFields form={form} fields={ATOM_NETWORK_FIELDS} />
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
