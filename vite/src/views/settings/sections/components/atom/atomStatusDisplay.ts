import {
	type ByocCacheStatus,
	ByocCacheStatus as CacheStatus,
} from "@autumn/shared";

/** How the destructive action reads: cancelling a setup is not deleting a live cache. */
export type AtomRemovalDisplay = {
	action: string;
	description: string;
	doneMessage: string;
	/** What the user loses; a removal that loses something is typed out before it runs. */
	consequences: string[];
};

type AtomStatusDisplay = {
	label: string;
	description: string;
	dotClassName: string;
	removal: AtomRemovalDisplay;
};

const CANCEL_SETUP: AtomRemovalDisplay = {
	action: "Cancel setup",
	description:
		"Autumn forgets this setup. Nothing was created in your AWS account yet, and you can deploy again at any time.",
	doneMessage: "Setup cancelled",
	consequences: [],
};

const DELETE_ATOM: AtomRemovalDisplay = {
	action: "Delete Atom",
	description:
		"Tears down Atom in your AWS account. You can deploy a new one later.",
	doneMessage: "Atom deleted",
	consequences: [
		"Every check goes to the Autumn API, so expect slower answers",
		"The machine and its volume are removed, with every stored balance",
		"Your CloudFormation stack stays until you delete it in AWS",
	],
};

export const ATOM_STATUS_DISPLAY: Record<ByocCacheStatus, AtomStatusDisplay> = {
	[CacheStatus.AwaitingSetup]: {
		label: "Waiting for setup",
		description:
			"Run the setup in your AWS account. This page updates on its own once the stack is created.",
		dotClassName: "bg-violet-500 motion-safe:animate-pulse",
		removal: CANCEL_SETUP,
	},
	[CacheStatus.Provisioning]: {
		label: "Provisioning",
		description: "Starting Atom in your AWS account.",
		dotClassName: "bg-amber-500 motion-safe:animate-pulse",
		removal: DELETE_ATOM,
	},
	[CacheStatus.Ready]: {
		label: "Ready",
		description: "Atom is live in your account.",
		dotClassName: "bg-green-500",
		removal: DELETE_ATOM,
	},
	[CacheStatus.Failed]: {
		label: "Setup failed",
		description:
			"The deployment did not finish. Delete it and deploy again to start over.",
		dotClassName: "bg-red-500",
		removal: { ...DELETE_ATOM, action: "Delete and start over" },
	},
	[CacheStatus.Removing]: {
		label: "Removing",
		description: "Removing Atom from your AWS account.",
		dotClassName: "bg-violet-500 motion-safe:animate-pulse",
		removal: DELETE_ATOM,
	},
	[CacheStatus.TeardownRequired]: {
		label: "Finish in AWS",
		description: "Delete the stack in AWS to finish.",
		dotClassName: "bg-orange-500",
		removal: DELETE_ATOM,
	},
};
