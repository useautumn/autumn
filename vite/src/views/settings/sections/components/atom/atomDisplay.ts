import {
	type ApiByocCache,
	BYOC_CACHE_STAGES,
	type ByocCacheMachine,
	type ByocCacheStage,
	ByocCacheStageStatus,
	ByocCacheStatus,
} from "@autumn/shared";
import type { StatusGlyph, StatusTone } from "@autumn/ui";

export type AtomChipDisplay = {
	label: string;
	tone: StatusTone;
	glyph: StatusGlyph;
};

export const ATOM_STAGE_LABELS: Record<ByocCacheStage, string> = {
	stack: "Stack",
	disk: "Disk",
	machine: "Machine",
	load_balancer: "Load balancer",
	atom: "Atom",
	connected: "Connected",
};

/** What each step stands up, shown beside it. */
export const atomStageDetail = ({
	stage,
	stackName,
	machine,
	region,
}: {
	stage: ByocCacheStage;
	stackName: string;
	machine: ByocCacheMachine | null;
	region: string | null;
}): string => {
	const details: Record<ByocCacheStage, string> = {
		stack: stackName,
		disk: "10 GB volume",
		machine: [machine?.instanceType, region].filter(Boolean).join(" · "),
		load_balancer: "TLS certificate",
		atom: "Health check",
		connected: "Autumn reaches Atom",
	};
	return details[stage];
};

export const ATOM_STAGE_STATUS_CHIPS: Record<
	ByocCacheStageStatus,
	AtomChipDisplay
> = {
	[ByocCacheStageStatus.Waiting]: {
		label: "Waiting",
		tone: "neutral",
		glyph: "minus",
	},
	[ByocCacheStageStatus.Running]: {
		label: "Running",
		tone: "purple",
		glyph: "play",
	},
	[ByocCacheStageStatus.Done]: { label: "Done", tone: "green", glyph: "check" },
	[ByocCacheStageStatus.Failed]: { label: "Failed", tone: "red", glyph: "x" },
};

export const ATOM_DEPLOYING_CHIP: AtomChipDisplay = {
	label: "Deploying",
	tone: "purple",
	glyph: "play",
};

export const ATOM_WAITING_FOR_AWS_CHIP: AtomChipDisplay = {
	label: "Waiting for AWS",
	tone: "yellow",
	glyph: "hourglass",
};

export const ATOM_CONNECTED_CHIP: AtomChipDisplay = {
	label: "Connected",
	tone: "green",
	glyph: "check",
};

export const ATOM_CONNECTING_CHIP: AtomChipDisplay = {
	label: "Connecting",
	tone: "purple",
	glyph: "spinner",
};

export const ATOM_REMOVING_CHIP: AtomChipDisplay = {
	label: "Removing",
	tone: "purple",
	glyph: "play",
};

export const ATOM_FINISH_IN_AWS_CHIP: AtomChipDisplay = {
	label: "Finish in AWS",
	tone: "orange",
	glyph: "alert",
};

export const isAtomStageDone = ({
	cache,
	stage,
}: {
	cache: ApiByocCache;
	stage: ByocCacheStage;
}) => cache.stages[stage] === ByocCacheStageStatus.Done;

export const isAtomConnected = (cache: ApiByocCache) =>
	isAtomStageDone({ cache, stage: "connected" });

/** The stack is in the org's cloud, so cloud, size and network can no longer change. */
export const hasAtomStack = (cache: ApiByocCache | null) =>
	cache !== null && cache.status !== ByocCacheStatus.AwaitingSetup;

export const isAtomBeingRemoved = (cache: ApiByocCache | null) =>
	cache?.status === ByocCacheStatus.Removing ||
	cache?.status === ByocCacheStatus.TeardownRequired;

/** The first step not done yet; null once Atom is connected. */
export const atomCurrentStage = (cache: ApiByocCache): ByocCacheStage | null =>
	BYOC_CACHE_STAGES.find((stage) => !isAtomStageDone({ cache, stage })) ?? null;

export const atomDeployPercent = (cache: ApiByocCache) => {
	const doneCount = BYOC_CACHE_STAGES.filter((stage) =>
		isAtomStageDone({ cache, stage }),
	).length;
	return Math.round((doneCount / BYOC_CACHE_STAGES.length) * 100);
};

/** Where to delete the org's stack: the CloudFormation console, filtered to it. */
export const awsStackConsoleUrl = ({
	stackName,
	region,
}: {
	stackName: string;
	region: string | null;
}) => {
	const query = new URLSearchParams({ filteringText: stackName });
	const regionQuery = region ? `?region=${region}` : "";
	return `https://console.aws.amazon.com/cloudformation/home${regionQuery}#/stacks?${query}`;
};
