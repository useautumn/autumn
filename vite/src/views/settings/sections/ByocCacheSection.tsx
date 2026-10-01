import {
	type ByocCacheMachine,
	ByocCacheStatus,
	DEFAULT_BYOC_CACHE_MACHINE,
} from "@autumn/shared";
import { Button, Skeleton } from "@autumn/ui";
import { useState } from "react";
import { toast } from "sonner";
import { useByocCacheQuery } from "@/hooks/queries/useByocCacheQuery";
import { getBackendErr } from "@/utils/genUtils";
import { SettingsSection } from "../SettingsSection";
import { ByocCacheActions } from "./components/byocCache/ByocCacheActions";
import { ByocCacheEmptyState } from "./components/byocCache/ByocCacheEmptyState";
import { ByocCacheMachineSection } from "./components/byocCache/ByocCacheMachineSection";
import { ByocCacheStatusCard } from "./components/byocCache/ByocCacheStatusCard";
import { cacheToMachine } from "./components/byocCache/byocCacheMachineDisplay";
import { BYOC_CACHE_STATUS_DISPLAY } from "./components/byocCache/byocCacheStatusDisplay";
import { DeleteByocCacheDialog } from "./components/byocCache/DeleteByocCacheDialog";
import { useByocCacheActions } from "./components/byocCache/useByocCacheActions";

export const ByocCacheSection = () => {
	const { cache, isLoading, error, refetch } = useByocCacheQuery();
	const { create, resize, remove, startSetup, setupUrl } =
		useByocCacheActions();
	const [deleteOpen, setDeleteOpen] = useState(false);

	const deploy = async (machine: ByocCacheMachine) => {
		try {
			await startSetup(machine);
		} catch (err) {
			toast.error(getBackendErr(err, "Failed to deploy the cache"));
		}
	};

	const removal = cache && BYOC_CACHE_STATUS_DISPLAY[cache.status].removal;

	const confirmDelete = async () => {
		try {
			await remove.mutateAsync();
			setDeleteOpen(false);
			toast.success(removal?.doneMessage ?? "Cache deleted");
		} catch (err) {
			toast.error(getBackendErr(err, "Failed to delete the cache"));
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
						{getBackendErr(error, "We couldn't load your cache.")}
					</p>
					<Button variant="secondary" onClick={() => refetch()}>
						Try again
					</Button>
				</div>
			);
		}

		if (!cache) {
			return (
				<ByocCacheEmptyState onDeploy={deploy} isDeploying={create.isPending} />
			);
		}

		const isReady = cache.status === ByocCacheStatus.Ready;
		return (
			<div className="flex flex-col gap-10">
				<ByocCacheStatusCard
					cache={cache}
					actions={
						<ByocCacheActions
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
				{isReady && <ByocCacheMachineSection cache={cache} resize={resize} />}
			</div>
		);
	};

	return (
		<SettingsSection
			title="Cache"
			description="Serve balance checks from a cache in your own AWS account"
		>
			{renderContent()}
			{cache && removal && (
				<DeleteByocCacheDialog
					removal={removal}
					confirmPhrase={`delete ${cache.env} cache`}
					open={deleteOpen}
					onOpenChange={setDeleteOpen}
					onConfirm={confirmDelete}
				/>
			)}
		</SettingsSection>
	);
};
