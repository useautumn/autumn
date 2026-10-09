import {
	type ApiByocCache,
	BYOC_CACHE_REMOVAL_STAGES,
	ByocCacheStageStatus,
	ByocCacheStatus,
} from "@autumn/shared";
import {
	Button,
	CopyIconButton,
	SmallSpinner,
	StatusChipIcon,
} from "@autumn/ui";
import { ArrowSquareOutIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { toast } from "sonner";
import { TABLE_TRAY_CLASS } from "@/components/general/table";
import { getBackendErr } from "@/utils/genUtils";
import { AtomFieldRow } from "./AtomFieldRow";
import { AtomProgress } from "./AtomProgress";
import { AtomSetupSection } from "./AtomSetupSection";
import { AtomStageTable } from "./AtomStageTable";
import { AtomStatusChip } from "./AtomStatusChip";
import { AtomStepper } from "./AtomStepper";
import {
	ATOM_REMOVING_CHIP,
	ATOM_STAGE_LABELS,
	ATOM_STAGE_STATUS_CHIPS,
	atomRemovalChip,
	atomRemovalPercent,
	atomStageDetail,
	awsStackConsoleUrl,
} from "./atomDisplay";
import { cacheToMachine } from "./atomMachineDisplay";
import { useAtomActions } from "./useAtomActions";

/** Step 1: what runs comes down, row by row; a failed delete can be retried. */
const AtomRemovingStep = ({ cache }: { cache: ApiByocCache }) => {
	const { remove } = useAtomActions();
	const isFailed = Boolean(cache.error);
	const machine = cacheToMachine(cache);
	const currentStage = BYOC_CACHE_REMOVAL_STAGES.find(
		(stage) => cache.stages[stage] !== ByocCacheStageStatus.Done,
	);
	const rows = BYOC_CACHE_REMOVAL_STAGES.map((stage) => {
		const status = cache.stages[stage];
		return {
			key: stage,
			label: ATOM_STAGE_LABELS[stage],
			detail: atomStageDetail({
				stage,
				stackName: cache.stack_name,
				machine,
				region: cache.region,
			}),
			chip:
				status === ByocCacheStageStatus.Running
					? ATOM_REMOVING_CHIP
					: ATOM_STAGE_STATUS_CHIPS[status],
			isReached: status !== ByocCacheStageStatus.Waiting,
		};
	});

	const retry = () =>
		remove.mutate(
			{ atomId: cache.id },
			{
				onError: (error) =>
					toast.error(getBackendErr(error, "Failed to retry the removal")),
			},
		);

	return (
		<AtomSetupSection
			status={<AtomStatusChip chip={atomRemovalChip(cache)} />}
			actions={
				isFailed && (
					<Button
						variant="primary"
						onClick={retry}
						isLoading={remove.isPending}
					>
						Retry
					</Button>
				)
			}
		>
			{isFailed && (
				<div
					role="alert"
					className="m-3 mb-0 flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
				>
					<WarningCircleIcon className="size-4 shrink-0" />
					{cache.error}
				</div>
			)}
			<AtomProgress
				label="Removal progress"
				percent={atomRemovalPercent(cache)}
				isFailed={isFailed}
				caption={
					isFailed && (
						<>
							<span>Retry once the cause above is fixed.</span>
							{currentStage && <span>{ATOM_STAGE_LABELS[currentStage]}</span>}
						</>
					)
				}
			/>
			<AtomStageTable rows={rows} />
		</AtomSetupSection>
	);
};

/** Step 2: Atom is gone; the org deletes its stack in AWS, and the page moves on once it is. */
const AtomDeleteStackStep = ({ cache }: { cache: ApiByocCache }) => {
	const stackName = cache.stack_name;
	return (
		<AtomSetupSection
			status={<AtomStatusChip chip={atomRemovalChip(cache)} />}
			actions={
				<Button variant="primary" asChild>
					<a
						href={awsStackConsoleUrl({ stackName, region: cache.region })}
						target="_blank"
						rel="noreferrer"
					>
						Delete stack in AWS
						<ArrowSquareOutIcon className="size-3.5" />
					</a>
				</Button>
			}
		>
			<div className="m-3 mb-1 rounded-md border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-sm text-amber-500">
				Atom is gone. Delete its stack in AWS to finish removing it.
			</div>
			<AtomFieldRow label="Stack name" isMuted>
				<div className="input-base flex h-7 w-80 min-w-0 items-center gap-2 rounded-lg pr-1 pl-2">
					<span
						className="min-w-0 flex-1 truncate font-mono text-xs"
						title={stackName}
					>
						{stackName}
					</span>
					<CopyIconButton text={stackName} />
				</div>
				{cache.region && (
					<span className="shrink-0 font-mono text-xs text-subtle">
						{cache.region}
					</span>
				)}
			</AtomFieldRow>
			<AtomFieldRow label="Leaves behind" isMuted>
				Roles, queue and network until the stack is deleted
			</AtomFieldRow>
			<AtomFieldRow label="Status" isMuted>
				<SmallSpinner size={14} />
				<span className="text-tertiary-foreground">
					Waiting for the stack to be deleted
				</span>
			</AtomFieldRow>
		</AtomSetupSection>
	);
};

/** A delete runs as its own stepper: Atom comes down, the org deletes its stack, then it is removed. */
export const AtomRemoval = ({ cache }: { cache: ApiByocCache }) => {
	const isRemoving = cache.status === ByocCacheStatus.Removing;
	const removingState = cache.error ? "failed" : "active";
	return (
		<div className={TABLE_TRAY_CLASS}>
			<AtomStepper
				steps={[
					{
						key: "remove",
						title: "Remove Atom",
						state: isRemoving ? removingState : "done",
					},
					{
						key: "stack",
						title: "Delete stack in AWS",
						state: isRemoving ? "upcoming" : "active",
					},
					{ key: "removed", title: "Removed", state: "upcoming" },
				]}
			/>
			{isRemoving ? (
				<AtomRemovingStep cache={cache} />
			) : (
				<AtomDeleteStackStep cache={cache} />
			)}
		</div>
	);
};

/** An Atom whose delete finished while the page was open, until dismissed. */
export const AtomRemoved = ({ onDismiss }: { onDismiss: () => void }) => (
	<div className="flex h-10 items-center justify-between gap-3 px-2 text-sm">
		<span className="flex items-center gap-2 text-tertiary-foreground">
			<StatusChipIcon tone="green" glyph="check" />
			Previous Atom removed
		</span>
		<Button variant="skeleton" size="mini" onClick={onDismiss}>
			Dismiss
		</Button>
	</div>
);
