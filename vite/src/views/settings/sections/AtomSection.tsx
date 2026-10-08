import {
	type ByocCacheMachine,
	ByocCacheStatus,
	DEFAULT_BYOC_CACHE_MACHINE,
} from "@autumn/shared";
import { Button, Skeleton } from "@autumn/ui";
import { useState } from "react";
import { toast } from "sonner";
import { useAtomQuery } from "@/hooks/queries/useAtomQuery";
import { getBackendErr } from "@/utils/genUtils";
import { SettingsSection } from "../SettingsSection";
import { AtomActions } from "./components/atom/AtomActions";
import { AtomEmptyState } from "./components/atom/AtomEmptyState";
import { AtomMachineSection } from "./components/atom/AtomMachineSection";
import { AtomStatusCard } from "./components/atom/AtomStatusCard";
import { cacheToMachine } from "./components/atom/atomMachineDisplay";
import { ATOM_STATUS_DISPLAY } from "./components/atom/atomStatusDisplay";
import { DeleteAtomDialog } from "./components/atom/DeleteAtomDialog";
import { useAtomActions } from "./components/atom/useAtomActions";

export const AtomSection = () => {
	const { cache, isLoading, error, refetch } = useAtomQuery();
	const { create, resize, remove, startSetup, setupUrl } = useAtomActions();
	const [deleteOpen, setDeleteOpen] = useState(false);

	const deploy = async (machine: ByocCacheMachine) => {
		try {
			await startSetup(machine);
		} catch (err) {
			toast.error(getBackendErr(err, "Failed to set up Atom"));
		}
	};

	const removal = cache && ATOM_STATUS_DISPLAY[cache.status].removal;

	const confirmDelete = async () => {
		try {
			await remove.mutateAsync();
			setDeleteOpen(false);
			toast.success(removal?.doneMessage ?? "Atom deleted");
		} catch (err) {
			toast.error(getBackendErr(err, "Failed to delete Atom"));
		}
	};

	const renderContent = () => {
		if (isLoading) {
			return (
				<div className="flex flex-col gap-3" aria-busy="true">
					<Skeleton className="h-5 w-48" aria-label="Loading" />
					<Skeleton className="h-24 w-full" aria-label="Loading" />
				</div>
			);
		}

		if (error) {
			return (
				<div
					role="alert"
					className="flex flex-col items-start gap-3 rounded-lg border bg-card p-4"
				>
					<p className="text-sm text-tertiary-foreground">
						{getBackendErr(error, "We couldn't load your Atom.")}
					</p>
					<Button variant="secondary" onClick={() => refetch()}>
						Try again
					</Button>
				</div>
			);
		}

		if (!cache) {
			return (
				<AtomEmptyState onDeploy={deploy} isDeploying={create.isPending} />
			);
		}

		const isReady = cache.status === ByocCacheStatus.Ready;
		return (
			<div className="flex flex-col gap-10">
				<AtomStatusCard
					cache={cache}
					actions={
						<AtomActions
							cache={cache}
							setupUrl={setupUrl}
							onGetSetupLink={() =>
								deploy(cacheToMachine(cache) ?? DEFAULT_BYOC_CACHE_MACHINE)
							}
							isGettingSetupLink={create.isPending}
							onDelete={() => setDeleteOpen(true)}
						/>
					}
				/>
				{isReady && <AtomMachineSection cache={cache} resize={resize} />}
			</div>
		);
	};

	return (
		<SettingsSection
			title="Atom"
			badge="PREVIEW"
			description="Answer balance checks from your own cloud."
		>
			{renderContent()}
			{cache && removal && (
				<DeleteAtomDialog
					removal={removal}
					confirmPhrase={`delete ${cache.env} atom`}
					open={deleteOpen}
					onOpenChange={setDeleteOpen}
					onConfirm={confirmDelete}
				/>
			)}
		</SettingsSection>
	);
};
