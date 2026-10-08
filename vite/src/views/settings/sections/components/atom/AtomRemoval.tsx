import { type ApiByocCache, ByocCacheStatus } from "@autumn/shared";
import { Button, SmallSpinner } from "@autumn/ui";
import { ArrowSquareOutIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { AtomFieldRow } from "./AtomFieldRow";
import { AtomProgress } from "./AtomProgress";
import { AtomSetupSection } from "./AtomSetupSection";
import { type AtomStageRow, AtomStageTable } from "./AtomStageTable";
import { AtomStatusChip } from "./AtomStatusChip";
import {
	ATOM_FINISH_IN_AWS_CHIP,
	ATOM_REMOVING_CHIP,
	ATOM_STAGE_LABELS,
	atomStageDetail,
	awsStackConsoleUrl,
} from "./atomDisplay";
import { cacheToMachine } from "./atomMachineDisplay";

/** A delete removes what runs; the org's stack, roles and snapshot stay until they delete it in AWS. */
export const AtomRemoval = ({
	cache,
	stackName,
}: {
	cache: ApiByocCache;
	stackName: string;
}) => {
	const isRemoving = cache.status === ByocCacheStatus.Removing;
	const machine = cacheToMachine(cache);
	const removingRows: AtomStageRow[] = (
		["machine", "disk", "load_balancer"] as const
	).map((stage) => ({
		key: stage,
		label: ATOM_STAGE_LABELS[stage],
		detail: atomStageDetail({
			stage,
			stackName,
			machine,
			region: cache.region,
		}),
		chip: ATOM_REMOVING_CHIP,
		isReached: true,
	}));

	return (
		<div className="flex flex-col gap-3">
			<AtomSetupSection
				step={1}
				title="Removing Atom"
				state={isRemoving ? "active" : "done"}
				summary="Machine, disk and load balancer removed"
				actions={<AtomStatusChip chip={ATOM_REMOVING_CHIP} />}
			>
				{cache.error && (
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
					percent={null}
					caption={<span>You can leave this page.</span>}
				/>
				<AtomStageTable rows={removingRows} />
			</AtomSetupSection>
			<AtomSetupSection
				step={2}
				title="Finish in AWS"
				state={isRemoving ? "upcoming" : "active"}
				actions={
					<>
						<AtomStatusChip chip={ATOM_FINISH_IN_AWS_CHIP} />
						<Button variant="primary" size="mini" asChild>
							<a
								href={awsStackConsoleUrl({ stackName, region: cache.region })}
								target="_blank"
								rel="noreferrer"
							>
								Delete stack in AWS
								<ArrowSquareOutIcon className="size-3.5" />
							</a>
						</Button>
					</>
				}
			>
				<AtomFieldRow label="Stack" isMuted>
					<span className="font-mono text-xs">{stackName}</span>
					{cache.region && (
						<span className="font-mono text-xs text-subtle">
							{cache.region}
						</span>
					)}
				</AtomFieldRow>
				<AtomFieldRow label="Leaves behind" isMuted>
					Roles, queue, network and a final disk snapshot
				</AtomFieldRow>
				<AtomFieldRow label="Status" isMuted>
					<SmallSpinner size={14} />
					<span className="text-tertiary-foreground">
						Waiting for the stack to be deleted
					</span>
				</AtomFieldRow>
			</AtomSetupSection>
		</div>
	);
};
