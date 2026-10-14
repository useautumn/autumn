import { ByocCacheStatus } from "@autumn/shared";
import { toast } from "sonner";
import { TABLE_TRAY_CLASS } from "@/components/general/table";
import { AtomApiProvider } from "@/contexts/AtomApiContext";
import { useAtomQuery } from "@/hooks/queries/useAtomQuery";
import { getBackendErr } from "@/utils/genUtils";
import { ATOM_DELETE_PROMPTS } from "@/views/settings/sections/components/atom/AtomDeleteDialog";
import { AtomDeploySection } from "@/views/settings/sections/components/atom/AtomDeploySection";
import { AtomMachineSection } from "@/views/settings/sections/components/atom/AtomMachineSection";
import { AtomRemovalSheet } from "@/views/settings/sections/components/atom/AtomRemovalSheet";
import { AtomSteadyState } from "@/views/settings/sections/components/atom/AtomSteadyState";
import {
	hasAtomStack,
	isAtomConnected,
} from "@/views/settings/sections/components/atom/atomDisplay";
import { useAtomActions } from "@/views/settings/sections/components/atom/useAtomActions";
import { useAtomDeleteDialog } from "@/views/settings/sections/components/atom/useAtomDeleteDialog";
import { RolloutSection } from "../edge-config/RolloutSection";
import { ShadowAtomCreate } from "./ShadowAtomCreate";
import { ShadowAtomSectionBody } from "./ShadowAtomSectionBody";

const SHADOW_ATOM_API = {
	basePath: "/admin/shadow-atom",
	queryKey: ["admin-shadow-atom"],
};

const showError = (fallback: string) => (error: unknown) =>
	toast.error(getBackendErr(error, fallback));

const ShadowAtomDeployment = () => {
	const { cache, stackName, isLoading, error, refetch } = useAtomQuery();
	const actions = useAtomActions();
	const { askToDelete, deleteDialog } = useAtomDeleteDialog({
		hasStack: hasAtomStack(cache),
		stackName,
		remove: actions.remove,
		onNoStack: () =>
			actions.remove.mutate({}, { onError: showError("Failed to cancel") }),
	});

	return (
		<ShadowAtomSectionBody
			isError={Boolean(error)}
			isPending={isLoading}
			what="the shadow Atom"
			onRetry={() => void refetch()}
		>
			{!cache && <ShadowAtomCreate actions={actions} />}
			{cache && isAtomConnected(cache) && (
				<div className="flex flex-col gap-10">
					<AtomSteadyState
						cache={cache}
						onDelete={() => askToDelete(ATOM_DELETE_PROMPTS.delete)}
					/>
					<AtomMachineSection cache={cache} resize={actions.resize} />
				</div>
			)}
			{cache && !isAtomConnected(cache) && (
				<div className={TABLE_TRAY_CLASS}>
					<AtomDeploySection
						cache={cache}
						stackName={stackName}
						state={
							cache.status === ByocCacheStatus.Failed ? "failed" : "active"
						}
						onCancel={() => askToDelete(ATOM_DELETE_PROMPTS.cancel)}
						onRetry={() =>
							actions.retry.mutate(undefined, {
								onError: showError("Failed to retry"),
							})
						}
						isRetrying={actions.retry.isPending}
						isCancelling={actions.remove.isPending}
					/>
				</div>
			)}
			{deleteDialog}
		</ShadowAtomSectionBody>
	);
};

const ShadowAtomRemovals = () => {
	const { removing } = useAtomQuery();
	return <AtomRemovalSheet removing={removing} />;
};

export const ShadowAtomDeploymentSection = () => (
	<AtomApiProvider value={SHADOW_ATOM_API}>
		<RolloutSection
			title="Shadow Atom"
			description="Our own Atom on alien, from the stack a customer's Atom uses, in multi-tenant mode for both envs."
			actions={<ShadowAtomRemovals />}
		>
			<ShadowAtomDeployment />
		</RolloutSection>
	</AtomApiProvider>
);
