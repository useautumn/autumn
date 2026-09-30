import {
	type ByocCacheStatus,
	ByocCacheStatus as CacheStatus,
} from "@autumn/shared";

/** How the destructive action reads: cancelling a setup is not deleting a live cache. */
export type ByocCacheRemovalDisplay = {
	action: string;
	description: string;
	doneMessage: string;
};

type ByocCacheStatusDisplay = {
	label: string;
	description: string;
	dotClassName: string;
	removal: ByocCacheRemovalDisplay;
};

const CANCEL_SETUP: ByocCacheRemovalDisplay = {
	action: "Cancel setup",
	description:
		"Autumn forgets this setup. Nothing was created in your AWS account yet, and you can deploy again at any time.",
	doneMessage: "Setup cancelled",
};

const DELETE_CACHE: ByocCacheRemovalDisplay = {
	action: "Delete cache",
	description:
		"Autumn stops writing to the table and forgets this deployment. The table stays in your AWS account until you delete its CloudFormation stack.",
	doneMessage: "Cache deleted",
};

export const BYOC_CACHE_STATUS_DISPLAY: Record<
	ByocCacheStatus,
	ByocCacheStatusDisplay
> = {
	[CacheStatus.AwaitingSetup]: {
		label: "Waiting for setup",
		description:
			"Run the setup in your AWS account. This page updates on its own once the stack is created.",
		dotClassName: "bg-violet-500 motion-safe:animate-pulse",
		removal: CANCEL_SETUP,
	},
	[CacheStatus.Provisioning]: {
		label: "Provisioning",
		description:
			"Creating the table in your account. This usually takes under a minute.",
		dotClassName: "bg-amber-500 motion-safe:animate-pulse",
		removal: DELETE_CACHE,
	},
	[CacheStatus.Ready]: {
		label: "Ready",
		description: "The cache is live in your account.",
		dotClassName: "bg-green-500",
		removal: DELETE_CACHE,
	},
	[CacheStatus.Failed]: {
		label: "Setup failed",
		description:
			"The deployment did not finish. Delete it and deploy again to start over.",
		dotClassName: "bg-red-500",
		removal: { ...DELETE_CACHE, action: "Delete and start over" },
	},
};
