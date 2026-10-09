import {
	type ApiByocCache,
	findByocCacheMachineByInstanceType,
} from "@autumn/shared";
import { Badge } from "@autumn/ui";
import { useState } from "react";
import { toast } from "sonner";
import { TABLE_TRAY_CLASS } from "@/components/general/table";
import { getBackendErr } from "@/utils/genUtils";
import { AtomAccountSection } from "./AtomAccountSection";
import { AtomCloudSection } from "./AtomCloudSection";
import {
	ATOM_DELETE_PROMPTS,
	AtomDeleteDialog,
	type AtomDeletePrompt,
} from "./AtomDeleteDialog";
import { AtomDeploySection } from "./AtomDeploySection";
import { AtomSteadyState } from "./AtomSteadyState";
import { type AtomStep, AtomStepper } from "./AtomStepper";
import { AtomVerifySection } from "./AtomVerifySection";
import { atomMachineSpecs } from "./atomMachineDisplay";
import { useAtomActions } from "./useAtomActions";
import { useAtomSetupFlow } from "./useAtomSetupFlow";
import { type AtomSetupValues, useAtomSetupForm } from "./useAtomSetupForm";

const cloudBadges = ({ instanceType, region }: AtomSetupValues) => {
	const machine = findByocCacheMachineByInstanceType({ instanceType });
	return ["AWS", region, machine && atomMachineSpecs(machine)].filter(
		(badge): badge is string => Boolean(badge),
	);
};

const NETWORK_BADGES: Record<AtomSetupValues["vpc"], string[]> = {
	existing_vpc: ["Existing VPC", "Private"],
	new_vpc: ["New VPC", "Public"],
};

/** A finished step's choices as badges on the tray. */
const AtomStepChoices = ({
	step,
	badges,
}: {
	step: AtomStep;
	badges: string[];
}) => (
	<div className="flex h-10 items-center gap-1.5 pr-1 pl-3 text-sm">
		<span className="w-36 shrink-0 text-tertiary-foreground">{step.title}</span>
		{badges.map((badge) => (
			<Badge key={badge} variant="muted">
				{badge}
			</Badge>
		))}
	</div>
);

/** Cloud & size, account setup, deploy and verify as one stepper; only the open step shows. */
export const AtomSetupFlow = ({
	cache,
	stackName,
	stackNameSuffix,
}: {
	cache: ApiByocCache | null;
	stackName: string;
	/** Autumn adds it after `-`, so only the part before it is editable. */
	stackNameSuffix: string;
}) => {
	const actions = useAtomActions();
	const { setOpenStep, isSetUp, finishSetup, hasStack, states, openStep } =
		useAtomSetupFlow({ cache });
	const form = useAtomSetupForm({
		cache,
		stackNameBase: stackName.replace(new RegExp(`-${stackNameSuffix}$`), ""),
		startSetup: actions.startSetup,
		onStarted: () => setOpenStep(null),
	});
	const [deletePrompt, setDeletePrompt] = useState<AtomDeletePrompt | null>(
		null,
	);

	const showError = (fallback: string) => (error: unknown) =>
		toast.error(getBackendErr(error, fallback));

	/** Before the stack exists there is nothing in AWS, so cancelling just starts over. */
	const resetSetup = async () => {
		if (cache)
			await actions.remove.mutateAsync({}).catch(showError("Failed to cancel"));
		form.reset();
		setOpenStep("cloud");
	};

	const askToDelete = (prompt: AtomDeletePrompt) => {
		if (hasStack) setDeletePrompt(prompt);
		else resetSetup();
	};

	const confirmDelete = () =>
		actions.remove.mutate(
			{},
			{
				onSuccess: () => setDeletePrompt(null),
				onError: showError("Failed to delete Atom"),
			},
		);

	const retry = () =>
		actions.retry.mutate(undefined, { onError: showError("Failed to retry") });

	const steps = {
		cloud: {
			key: "cloud",
			title: "Cloud & size",
			state: states.cloud,
			onEdit: () => setOpenStep("cloud"),
		},
		account: {
			key: "account",
			title: "Account setup",
			state: states.account,
			onEdit: () => setOpenStep("account"),
		},
		deploy: { key: "deploy", title: "Deploy", state: states.deploy },
		verify: { key: "verify", title: "Verify", state: states.verify },
	} satisfies Record<string, AtomStep>;

	const deleteDialog = (
		<AtomDeleteDialog
			prompt={deletePrompt}
			stackName={stackName}
			onOpenChange={(open) => !open && setDeletePrompt(null)}
			onConfirm={confirmDelete}
			isDeleting={actions.remove.isPending}
		/>
	);

	if (isSetUp && cache)
		return (
			<>
				<AtomSteadyState
					cache={cache}
					onDelete={() => askToDelete(ATOM_DELETE_PROMPTS.delete)}
				/>
				{deleteDialog}
			</>
		);

	return (
		<div className="flex flex-col gap-10">
			<div className={TABLE_TRAY_CLASS}>
				<AtomStepper steps={Object.values(steps)} />
				<form.Subscribe selector={(formState) => formState.values}>
					{(values) => (
						<>
							{openStep !== "cloud" && (
								<AtomStepChoices
									step={steps.cloud}
									badges={cloudBadges(values)}
								/>
							)}
							{openStep !== "cloud" && openStep !== "account" && (
								<AtomStepChoices
									step={steps.account}
									badges={NETWORK_BADGES[values.vpc]}
								/>
							)}
						</>
					)}
				</form.Subscribe>
				{openStep === "cloud" && (
					<AtomCloudSection
						form={form}
						onContinue={() => setOpenStep("account")}
					/>
				)}
				{openStep === "account" && (
					<AtomAccountSection
						form={form}
						stackNameSuffix={stackNameSuffix}
						hasSetupLink={cache !== null}
						onBack={() => setOpenStep("cloud")}
						onCancel={resetSetup}
						isCancelling={actions.remove.isPending}
					/>
				)}
				{openStep === "deploy" && cache && (
					<AtomDeploySection
						cache={cache}
						stackName={stackName}
						state={states.deploy}
						onCancel={() => askToDelete(ATOM_DELETE_PROMPTS.cancel)}
						onRetry={retry}
						isRetrying={actions.retry.isPending}
						isCancelling={actions.remove.isPending}
					/>
				)}
				{openStep === "verify" && cache && (
					<AtomVerifySection
						cache={cache}
						onDelete={() => askToDelete(ATOM_DELETE_PROMPTS.delete)}
						onFinish={finishSetup}
					/>
				)}
			</div>
			{deleteDialog}
		</div>
	);
};
