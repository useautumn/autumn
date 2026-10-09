import {
	type ApiByocCache,
	BYOC_CACHE_STAGES,
	ByocCacheStageStatus,
	ByocCacheStatus,
} from "@autumn/shared";
import { Button } from "@autumn/ui";
import { ArrowSquareOutIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { AtomProgress } from "./AtomProgress";
import { AtomSetupSection } from "./AtomSetupSection";
import { AtomStageTable } from "./AtomStageTable";
import { AtomStatusChip } from "./AtomStatusChip";
import type { AtomSectionState } from "./AtomStepper";
import {
	ATOM_DEPLOYING_CHIP,
	ATOM_STAGE_LABELS,
	ATOM_STAGE_STATUS_CHIPS,
	ATOM_WAITING_FOR_AWS_CHIP,
	atomCurrentStage,
	atomDeployPercent,
	atomStageDetail,
	awsStackConsoleUrl,
} from "./atomDisplay";
import { cacheToMachine } from "./atomMachineDisplay";

/** A stack that dies in AWS before it registers never reaches alien, so a long wait is the only sign. */
const STALE_SETUP_MS = 24 * 60 * 60 * 1000;

const deployCaption = ({
	isFailed,
	isAwaitingAws,
	isStale,
}: {
	isFailed: boolean;
	isAwaitingAws: boolean;
	isStale: boolean;
}) => {
	if (isFailed) return "Retry once the cause above is fixed.";
	if (isStale)
		return "No stack yet after a day. If it failed in AWS, cancel and start over.";
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
	isCancelling,
}: {
	cache: ApiByocCache;
	stackName: string;
	state: AtomSectionState;
	onCancel: () => void;
	onRetry: () => void;
	isRetrying: boolean;
	isCancelling: boolean;
}) => {
	const isFailed = state === "failed";
	const isAwaitingAws = cache.status === ByocCacheStatus.AwaitingSetup;
	const currentStage = atomCurrentStage(cache);
	const machine = cacheToMachine(cache);

	const status = !isFailed && (
		<AtomStatusChip
			chip={isAwaitingAws ? ATOM_WAITING_FOR_AWS_CHIP : ATOM_DEPLOYING_CHIP}
		/>
	);

	const actions = isFailed ? (
		<>
			<Button variant="secondary" onClick={onCancel} isLoading={isCancelling}>
				Start over
			</Button>
			<Button variant="primary" onClick={onRetry} isLoading={isRetrying}>
				Retry
			</Button>
		</>
	) : (
		<Button variant="secondary" onClick={onCancel} isLoading={isCancelling}>
			Cancel
		</Button>
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
		<AtomSetupSection status={status} actions={actions}>
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
						<span>
							{deployCaption({
								isFailed,
								isAwaitingAws,
								isStale:
									isAwaitingAws &&
									Date.now() - cache.created_at > STALE_SETUP_MS,
							})}
						</span>
						{isAwaitingAws ? (
							<a
								href={awsStackConsoleUrl({ stackName, region: cache.region })}
								target="_blank"
								rel="noreferrer"
								className="flex shrink-0 items-center gap-1 hover:text-foreground"
							>
								View stack in AWS
								<ArrowSquareOutIcon className="size-3" />
							</a>
						) : (
							currentStage && <span>{ATOM_STAGE_LABELS[currentStage]}</span>
						)}
					</>
				}
			/>
			<AtomStageTable rows={rows} />
		</AtomSetupSection>
	);
};
