import type { ApiByocCache } from "@autumn/shared";
import { useState } from "react";
import { toast } from "sonner";
import { getBackendErr } from "@/utils/genUtils";
import { AtomAccountSection } from "./AtomAccountSection";
import { AtomCloudSection } from "./AtomCloudSection";
import {
	ATOM_DELETE_PROMPTS,
	AtomDeleteDialog,
	type AtomDeletePrompt,
} from "./AtomDeleteDialog";
import { AtomDeploySection } from "./AtomDeploySection";
import { AtomMachineSection } from "./AtomMachineSection";
import { AtomSetupSection } from "./AtomSetupSection";
import { AtomVerifySection } from "./AtomVerifySection";
import { useAtomActions } from "./useAtomActions";
import { useAtomSetupFlow } from "./useAtomSetupFlow";
import { useAtomSetupForm } from "./useAtomSetupForm";

/** Cloud & size, account setup, deploy and verify as one page of sections. */
export const AtomSetupFlow = ({
	cache,
	stackName,
}: {
	cache: ApiByocCache | null;
	stackName: string;
}) => {
	const actions = useAtomActions();
	const { setOpenStep, hasStack, states } = useAtomSetupFlow({
		cache,
	});
	const form = useAtomSetupForm({
		cache,
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
			await actions.remove.mutateAsync().catch(showError("Failed to cancel"));
		form.reset();
		setOpenStep("cloud");
	};

	const askToDelete = (prompt: AtomDeletePrompt) => {
		if (hasStack) setDeletePrompt(prompt);
		else resetSetup();
	};

	const confirmDelete = () =>
		actions.remove.mutate(undefined, {
			onSuccess: () => setDeletePrompt(null),
			onError: showError("Failed to delete Atom"),
		});

	const retry = () =>
		actions.retry.mutate(undefined, { onError: showError("Failed to retry") });

	return (
		<div className="flex flex-col gap-3">
			<AtomCloudSection
				form={form}
				state={states.cloud}
				onContinue={() => setOpenStep("account")}
				onEdit={() => setOpenStep("cloud")}
			/>
			<AtomAccountSection
				form={form}
				state={states.account}
				stackName={stackName}
				hasSetupLink={cache !== null}
				onEdit={() => setOpenStep("account")}
				onCancel={resetSetup}
			/>
			{cache ? (
				<AtomDeploySection
					cache={cache}
					stackName={stackName}
					state={states.deploy}
					onCancel={() => askToDelete(ATOM_DELETE_PROMPTS.cancel)}
					onRetry={retry}
					isRetrying={actions.retry.isPending}
				/>
			) : (
				<AtomSetupSection step={3} title="Deploy" state="upcoming" />
			)}
			{cache ? (
				<AtomVerifySection
					cache={cache}
					state={states.verify}
					revealToken={actions.revealToken}
					onDelete={() => askToDelete(ATOM_DELETE_PROMPTS.delete)}
				/>
			) : (
				<AtomSetupSection step={4} title="Verify" state="upcoming" />
			)}
			{cache && states.verify === "active" && (
				<div className="pt-7">
					<AtomMachineSection cache={cache} resize={actions.resize} />
				</div>
			)}
			<AtomDeleteDialog
				prompt={deletePrompt}
				onOpenChange={(open) => !open && setDeletePrompt(null)}
				onConfirm={confirmDelete}
				isDeleting={actions.remove.isPending}
			/>
		</div>
	);
};
