import {
	type ApiAtomLimits,
	type ApiByocCache,
	type AtomCheck,
	BYOC_CACHE_REMOVAL_STAGES,
	BYOC_CACHE_STAGES,
	type ByocCacheMachine,
	type ByocCacheStage,
	ByocCacheStageStatus,
	ByocCacheStatus,
	DEFAULT_BYOC_CACHE_VOLUME_GIB,
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
		disk: `${DEFAULT_BYOC_CACHE_VOLUME_GIB} GB volume`,
		machine: [machine?.instanceType, region].filter(Boolean).join(" · "),
		load_balancer: "TLS certificate",
		atom: "Health check",
		connected: "Atom reports in",
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
		glyph: "spinner",
	},
	[ByocCacheStageStatus.Done]: { label: "Done", tone: "green", glyph: "check" },
	[ByocCacheStageStatus.Failed]: { label: "Failed", tone: "red", glyph: "x" },
};

export const ATOM_DEPLOYING_CHIP: AtomChipDisplay = {
	label: "Deploying",
	tone: "purple",
	glyph: "spinner",
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

export const ATOM_RECEIVING_CHECKS_CHIP: AtomChipDisplay = {
	label: "Receiving checks",
	tone: "green",
	glyph: "check",
};

/** Who answered a check: Atom on its own, or the Autumn API it forwarded to. */
export const ATOM_CHECK_ANSWERED_BY_CHIPS: Record<
	AtomCheck["answered_by"],
	AtomChipDisplay
> = {
	atom: { label: "Atom", tone: "green", glyph: "check" },
	api: { label: "Autumn API", tone: "neutral", glyph: "arrowsClockwise" },
};

export const ATOM_REMOVING_CHIP: AtomChipDisplay = {
	label: "Removing",
	tone: "purple",
	glyph: "spinner",
};

export const ATOM_ACTION_IN_AWS_CHIP: AtomChipDisplay = {
	label: "Action needed in AWS",
	tone: "amber",
	glyph: "alert",
};

export const ATOM_REMOVAL_FAILED_CHIP: AtomChipDisplay = {
	label: "Removal failed",
	tone: "red",
	glyph: "x",
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

/** The org finished setup, so its page shows the Atom rather than the setup steps. */
export const isAtomSetUp = (cache: ApiByocCache | null) =>
	Boolean(cache?.first_check_at);

/** The stack is in the org's cloud, so cloud, size and network can no longer change. */
export const hasAtomStack = (cache: ApiByocCache | null) =>
	cache !== null && cache.status !== ByocCacheStatus.AwaitingSetup;

export const isAtomBeingRemoved = (cache: ApiByocCache | null) =>
	cache?.status === ByocCacheStatus.Removing ||
	cache?.status === ByocCacheStatus.TeardownRequired;

/** What the org calls the Atom: its name, else its region, else its stack. */
export const atomDisplayName = (cache: ApiByocCache) =>
	cache.name ?? cache.region ?? cache.stack_name;

/** Why New Atom is off, as its tooltip says it; null when it is on. */
export const atomCreateRefusal = (limits: ApiAtomLimits): string | null => {
	if (limits.reason === "not_on_plan")
		return "Atom isn't included in your plan.";
	if (limits.reason === "limit_reached")
		return `This environment runs at most ${limits.limit} Atoms.`;
	return null;
};

/** One chip for where an Atom stands, as the list and the switcher show it. */
export const atomStatusChip = (cache: ApiByocCache): AtomChipDisplay => {
	if (cache.status === ByocCacheStatus.Failed)
		return ATOM_STAGE_STATUS_CHIPS.failed;
	if (cache.status === ByocCacheStatus.AwaitingSetup)
		return ATOM_WAITING_FOR_AWS_CHIP;
	if (cache.status === ByocCacheStatus.Provisioning) return ATOM_DEPLOYING_CHIP;
	return isAtomConnected(cache) ? ATOM_CONNECTED_CHIP : ATOM_CONNECTING_CHIP;
};

/** The first step not done yet; null once Atom is connected. */
export const atomCurrentStage = (cache: ApiByocCache): ByocCacheStage | null =>
	BYOC_CACHE_STAGES.find((stage) => !isAtomStageDone({ cache, stage })) ?? null;

export const atomDeployPercent = (cache: ApiByocCache) => {
	const doneCount = BYOC_CACHE_STAGES.filter((stage) =>
		isAtomStageDone({ cache, stage }),
	).length;
	return Math.round((doneCount / BYOC_CACHE_STAGES.length) * 100);
};

/** A delete waits on the org: to delete its stack in AWS, or to retry once what stopped it is fixed. */
export const isAtomRemovalWaitingOnYou = (cache: ApiByocCache) =>
	cache.status === ByocCacheStatus.TeardownRequired || Boolean(cache.error);

export const atomRemovalPercent = (cache: ApiByocCache) => {
	const removedCount = BYOC_CACHE_REMOVAL_STAGES.filter((stage) =>
		isAtomStageDone({ cache, stage }),
	).length;
	return Math.round((removedCount / BYOC_CACHE_REMOVAL_STAGES.length) * 100);
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
