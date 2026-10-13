import {
	type ApiByocCache,
	BYOC_CACHE_REMOVAL_STAGES,
	ByocCacheStageStatus,
	ByocCacheStatus,
} from "@autumn/shared";
import { Button, StatusChipIcon } from "@autumn/ui";
import { ArrowSquareOutIcon } from "@phosphor-icons/react";
import { toast } from "sonner";
import {
	TABLE_TRAY_CLASS,
	TABLE_TRAY_SURFACE_CLASS,
} from "@/components/general/table";
import { cn } from "@/lib/utils";
import { getBackendErr } from "@/utils/genUtils";
import { AtomCopyValue } from "./AtomCopyValue";
import { AtomStepMarker } from "./AtomStepper";
import { ATOM_PAGE_CARD_SURFACE_CELL_CLASS } from "./atomCardLayout";
import {
	ATOM_ACTION_IN_AWS_CHIP,
	ATOM_REMOVAL_FAILED_CHIP,
	ATOM_REMOVING_CHIP,
	ATOM_STAGE_LABELS,
	ATOM_STAGE_STATUS_CHIPS,
	type AtomChipDisplay,
	atomRemovalPercent,
	awsStackConsoleUrl,
	isAtomStageDone,
} from "./atomDisplay";
import { useAtomActions } from "./useAtomActions";

type AtomRemovalStep = {
	key: string;
	title: string;
	detail?: string;
	/** Null until the step is reached, which shows its number. */
	chip: AtomChipDisplay | null;
};

const DONE_CHIP = ATOM_STAGE_STATUS_CHIPS[ByocCacheStageStatus.Done];

const stepTitleClass = (chip: AtomChipDisplay | null) => {
	if (!chip) return "text-subtle";
	if (chip === DONE_CHIP) return "text-tertiary-foreground";
	if (chip === ATOM_ACTION_IN_AWS_CHIP) return "text-amber-500";
	return "text-foreground";
};

const AWS_STEP = "Delete stack in AWS";

const REMOVED_STEPS: AtomRemovalStep[] = [
	{ key: "autumn", title: "Removed from Autumn", chip: DONE_CHIP },
	{ key: "stack", title: "Stack deleted in AWS", chip: DONE_CHIP },
	{ key: "removed", title: "Removed", chip: DONE_CHIP },
];

/** Autumn takes down what runs, the org deletes the stack in AWS, then the Atom is removed. */
const atomRemovalSteps = (cache: ApiByocCache): AtomRemovalStep[] => {
	const removedStep = { key: "removed", title: "Removed", chip: null };
	if (cache.status === ByocCacheStatus.TeardownRequired)
		return [
			REMOVED_STEPS[0],
			{
				key: "stack",
				title: AWS_STEP,
				detail: "Waiting on you",
				chip: ATOM_ACTION_IN_AWS_CHIP,
			},
			removedStep,
		];

	const currentStage = BYOC_CACHE_REMOVAL_STAGES.find(
		(stage) => !isAtomStageDone({ cache, stage }),
	);
	return [
		{
			key: "autumn",
			title: "Removing from Autumn",
			detail: [
				currentStage && ATOM_STAGE_LABELS[currentStage],
				`${atomRemovalPercent(cache)}%`,
			]
				.filter(Boolean)
				.join(" · "),
			chip: cache.error ? ATOM_REMOVAL_FAILED_CHIP : ATOM_REMOVING_CHIP,
		},
		{ key: "stack", title: AWS_STEP, chip: null },
		removedStep,
	];
};

/** One earlier Atom: its stack, the delete's steps, and what to do next on the shared right edge. */
const AtomRemovalCard = ({
	cache,
	steps,
	hint,
	action,
	isWaitingOnYou = false,
	className,
}: {
	cache: ApiByocCache;
	steps: AtomRemovalStep[];
	hint: React.ReactNode;
	action: React.ReactNode;
	isWaitingOnYou?: boolean;
	className?: string;
}) => (
	<div className={cn(TABLE_TRAY_CLASS, className)}>
		<div className={TABLE_TRAY_SURFACE_CLASS}>
			<div
				className={cn(
					"flex h-11 items-center justify-between gap-4 border-b border-table-row-divider",
					ATOM_PAGE_CARD_SURFACE_CELL_CLASS,
				)}
			>
				<AtomCopyValue text={cache.stack_name} />
				{cache.region && (
					<span className="shrink-0 font-mono text-xs text-subtle">
						{cache.region}
					</span>
				)}
			</div>
			<ol
				className={cn("flex flex-col py-2", ATOM_PAGE_CARD_SURFACE_CELL_CLASS)}
			>
				{steps.map((step, index) => (
					<li
						key={step.key}
						aria-current={
							step.chip && step.chip !== DONE_CHIP ? "step" : undefined
						}
						className="flex h-7 items-center gap-2.5 text-sm"
					>
						<span className="flex size-4 shrink-0 items-center justify-center">
							{step.chip ? (
								<StatusChipIcon tone={step.chip.tone} glyph={step.chip.glyph} />
							) : (
								<AtomStepMarker index={index} state="upcoming" />
							)}
						</span>
						<span
							className={cn("shrink-0 font-medium", stepTitleClass(step.chip))}
						>
							{step.title}
						</span>
						{step.detail && (
							<span className="truncate text-subtle">{step.detail}</span>
						)}
					</li>
				))}
			</ol>
			<div
				className={cn(
					"flex h-13 items-center justify-between gap-4 border-t border-table-row-divider",
					ATOM_PAGE_CARD_SURFACE_CELL_CLASS,
					isWaitingOnYou && "bg-amber-500/[0.03]",
				)}
			>
				<span className="min-w-0 truncate text-sm text-subtle">{hint}</span>
				{action}
			</div>
		</div>
	</div>
);

const AwsStackLink = ({
	cache,
	isPrimary = false,
	children,
}: {
	cache: ApiByocCache;
	isPrimary?: boolean;
	children: React.ReactNode;
}) => (
	<Button
		variant={isPrimary ? "primary" : "secondary"}
		size="mini"
		className="shrink-0"
		asChild
	>
		<a
			href={awsStackConsoleUrl({
				stackName: cache.stack_name,
				region: cache.region,
			})}
			target="_blank"
			rel="noreferrer"
		>
			{children}
			<ArrowSquareOutIcon className="size-3.5" />
		</a>
	</Button>
);

/** An Atom being deleted: Autumn takes it down, the org deletes its stack in AWS, then it is removed. */
export const AtomRemoval = ({
	cache,
	className,
}: {
	cache: ApiByocCache;
	/** e.g. to hang into the gutter when it sits on a page rather than in the sheet. */
	className?: string;
}) => {
	const { remove } = useAtomActions();
	const steps = atomRemovalSteps(cache);

	if (cache.status === ByocCacheStatus.TeardownRequired)
		return (
			<AtomRemovalCard
				cache={cache}
				steps={steps}
				className={className}
				hint="AWS resources still running"
				action={
					<AwsStackLink cache={cache} isPrimary>
						{AWS_STEP}
					</AwsStackLink>
				}
				isWaitingOnYou
			/>
		);

	if (cache.error)
		return (
			<AtomRemovalCard
				cache={cache}
				steps={steps}
				className={className}
				hint={
					<span className="text-destructive" title={cache.error}>
						{cache.error}
					</span>
				}
				action={
					<Button
						variant="primary"
						size="mini"
						className="shrink-0"
						isLoading={remove.isPending}
						onClick={() =>
							remove.mutate(
								{ atomId: cache.id },
								{
									onError: (error) =>
										toast.error(
											getBackendErr(error, "Failed to retry the removal"),
										),
								},
							)
						}
					>
						Retry
					</Button>
				}
				isWaitingOnYou
			/>
		);

	return (
		<AtomRemovalCard
			cache={cache}
			steps={steps}
			className={className}
			hint="Updates on its own. Nothing to do."
			action={<AwsStackLink cache={cache}>Open in AWS</AwsStackLink>}
		/>
	);
};

/** An Atom whose delete finished while the page was open, until dismissed. */
export const AtomRemoved = ({
	cache,
	onDismiss,
}: {
	cache: ApiByocCache;
	onDismiss: () => void;
}) => (
	<AtomRemovalCard
		cache={cache}
		steps={REMOVED_STEPS}
		hint="Its stack is gone from AWS."
		action={
			<Button
				variant="secondary"
				size="mini"
				className="shrink-0"
				onClick={onDismiss}
			>
				Dismiss
			</Button>
		}
	/>
);
