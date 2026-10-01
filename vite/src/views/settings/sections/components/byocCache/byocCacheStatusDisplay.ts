import {
	type ByocCacheStatus,
	ByocCacheStatus as CacheStatus,
} from "@autumn/shared";

/** How the destructive action reads: cancelling a setup is not deleting a live cache. */
export type ByocCacheRemovalDisplay = {
	action: string;
	description: string;
	doneMessage: string;
	/** What the user loses; a removal that loses something is typed out before it runs. */
	consequences: string[];
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
	consequences: [],
};

const DELETE_CACHE: ByocCacheRemovalDisplay = {
	action: "Delete cache",
	description:
		"Tears down the cache in your AWS account. You can deploy a new one later.",
	doneMessage: "Cache deleted",
	consequences: [
		"Every check goes to the Autumn API, so expect slower answers",
		"The machine and its volume are removed, with every stored balance",
		"Your CloudFormation stack stays until you delete it in AWS",
	],
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
