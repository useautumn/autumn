import {
	type ApiByocCache,
	BYOC_CACHE_STAGES,
	ByocCacheStageStatus,
	ByocCacheStatus,
} from "@autumn/shared";
import { Button } from "@autumn/ui";
import { WarningCircleIcon } from "@phosphor-icons/react";
import { AtomProgress } from "./AtomProgress";
import { type AtomSectionState, AtomSetupSection } from "./AtomSetupSection";
import { AtomStageTable } from "./AtomStageTable";
import { AtomStatusChip } from "./AtomStatusChip";
import {
	ATOM_DEPLOYING_CHIP,
	ATOM_STAGE_LABELS,
	ATOM_STAGE_STATUS_CHIPS,
	ATOM_WAITING_FOR_AWS_CHIP,
	atomCurrentStage,
	atomDeployPercent,
	atomStageDetail,
} from "./atomDisplay";
import { cacheToMachine } from "./atomMachineDisplay";

/** A finished deploy is ready; a failed one names the step it stopped at. */
const deploySummary = (cache: ApiByocCache) => {
	const currentStage = atomCurrentStage(cache);
	return currentStage
		? `Stopped at ${ATOM_STAGE_LABELS[currentStage]}`
		: "Ready";
};

const deployCaption = ({
	isFailed,
	isAwaitingAws,
}: {
	isFailed: boolean;
	isAwaitingAws: boolean;
}) => {
	if (isFailed) return "Retry once the cause above is fixed.";
	if (isAwaitingAws) return "Create the stack in AWS to start.";
	return "You can leave this page.";
};

/** Step 3: alien stands Atom up in the org's cloud, one step at a time. */
export const AtomDeploySection = ({
	cache,
	stackName,
	state,
	onCancel,
	onRetry,
	isRetrying,
}: {
	cache: ApiByocCache;
	stackName: string;
	state: AtomSectionState;
	onCancel: () => void;
	onRetry: () => void;
	isRetrying: boolean;
}) => {
	const isFailed = state === "failed";
	const isAwaitingAws = cache.status === ByocCacheStatus.AwaitingSetup;
	const currentStage = atomCurrentStage(cache);
	const machine = cacheToMachine(cache);

	const actions = isFailed ? (
		<>
			<Button variant="secondary" size="mini" onClick={onCancel}>
				Start over
			</Button>
			<Button
				variant="primary"
				size="mini"
				onClick={onRetry}
				isLoading={isRetrying}
			>
				Retry
			</Button>
		</>
	) : (
		<>
			<AtomStatusChip
				chip={isAwaitingAws ? ATOM_WAITING_FOR_AWS_CHIP : ATOM_DEPLOYING_CHIP}
			/>
			<Button variant="secondary" size="mini" onClick={onCancel}>
				Cancel
			</Button>
		</>
	);

	const rows = BYOC_CACHE_STAGES.map((stage) => ({
		key: stage,
		label: ATOM_STAGE_LABELS[stage],
		detail: atomStageDetail({
			stage,
			stackName,
			machine,
			region: cache.region,
		}),
		chip: ATOM_STAGE_STATUS_CHIPS[cache.stages[stage]],
		isReached: cache.stages[stage] !== ByocCacheStageStatus.Waiting,
	}));

	return (
		<AtomSetupSection
			step={3}
			title="Deploy"
			state={state}
			summary={deploySummary(cache)}
			actions={actions}
		>
			{isFailed && cache.error && (
				<div
					role="alert"
					className="m-3 mb-0 flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
				>
					<WarningCircleIcon className="size-4 shrink-0" />
					{cache.error}
				</div>
			)}
			<AtomProgress
				label="Deploy progress"
				percent={atomDeployPercent(cache)}
				isFailed={isFailed}
				caption={
					<>
						<span>{deployCaption({ isFailed, isAwaitingAws })}</span>
						{currentStage && <span>{ATOM_STAGE_LABELS[currentStage]}</span>}
					</>
				}
			/>
			<AtomStageTable rows={rows} />
		</AtomSetupSection>
	);
};
