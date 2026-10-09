import type { ApiByocCache } from "@autumn/shared";
import { Button, CopyButton, StatusChip } from "@autumn/ui";
import {
	ArrowSquareOutIcon,
	CaretUpIcon,
	TrashIcon,
} from "@phosphor-icons/react";
import {
	TABLE_TRAY_CLASS,
	TABLE_TRAY_SURFACE_CLASS,
	TABLE_TRAY_SURFACE_DIVIDER_CLASS,
} from "@/components/general/table";
import { useLocalStorage } from "@/hooks/common/useLocalStorage";
import { cn } from "@/lib/utils";
import { SettingsListRow } from "@/views/settings/components/SettingsListRow";
import { AtomFieldRow } from "./AtomFieldRow";
import { AtomStatusChip } from "./AtomStatusChip";
import { ATOM_CONNECTED_CHIP, awsStackConsoleUrl } from "./atomDisplay";
import { atomMachineSpecs, cacheToMachine } from "./atomMachineDisplay";
import { atomNetwork } from "./atomNetworkDisplay";
import { awsRegionLabel } from "./atomRegionDisplay";

const COPY_VALUE_CLASS =
	"min-w-0 max-w-full shrink font-mono text-xs [&>span]:min-w-0";

/** The connected Atom at a glance as chips; its details and delete fold away beneath. */
export const AtomDetails = ({
	cache,
	onDelete,
}: {
	cache: ApiByocCache;
	onDelete: () => void;
}) => {
	const [isOpen, setIsOpen] = useLocalStorage("atom:details-open", false);
	const machine = cacheToMachine(cache);
	const network = atomNetwork(cache);
	const { stack_name: stackName, region, endpoint_url: url } = cache;

	return (
		<div className={cn(TABLE_TRAY_CLASS, "@container")}>
			<div className="flex h-10 items-center gap-1.5 pr-1 pl-2">
				<div className="flex shrink-0 items-center gap-1.5">
					<AtomStatusChip chip={ATOM_CONNECTED_CHIP} />
					{region && <StatusChip className="font-mono">{region}</StatusChip>}
					{machine && <StatusChip>{atomMachineSpecs(machine)}</StatusChip>}
					<StatusChip>
						<network.Icon className="size-3.5" />
						{network.label}
					</StatusChip>
				</div>
				{/* The rows below name the stack too, so a narrow card drops it first. */}
				<StatusChip className="hidden max-w-44 font-mono @xl:inline-flex">
					{stackName}
				</StatusChip>
				<Button
					variant="secondary"
					size="mini"
					className="ml-auto shrink-0"
					aria-expanded={isOpen}
					onClick={() => setIsOpen(!isOpen)}
				>
					{isOpen ? "Hide details" : "Show details"}
					<CaretUpIcon className={cn("size-3", !isOpen && "rotate-180")} />
				</Button>
			</div>
			{isOpen && (
				<div className={TABLE_TRAY_SURFACE_CLASS}>
					{url && (
						<AtomFieldRow label="URL" isMuted>
							<CopyButton text={url} className={COPY_VALUE_CLASS} />
						</AtomFieldRow>
					)}
					<AtomFieldRow label="Stack name" isMuted>
						<CopyButton text={stackName} className={COPY_VALUE_CLASS} />
						<Button
							variant="secondary"
							size="mini"
							className="ml-auto shrink-0"
							asChild
						>
							<a
								href={awsStackConsoleUrl({ stackName, region })}
								target="_blank"
								rel="noreferrer"
							>
								Open in AWS
								<ArrowSquareOutIcon className="size-3.5" />
							</a>
						</Button>
					</AtomFieldRow>
					{region && (
						<AtomFieldRow label="Region" isMuted>
							<span className="shrink-0 font-mono text-xs">{region}</span>
							<span className="truncate text-tertiary-foreground">
								{awsRegionLabel(region)}
							</span>
						</AtomFieldRow>
					)}
					{machine && (
						<AtomFieldRow label="Machine" isMuted>
							{atomMachineSpecs(machine)}
						</AtomFieldRow>
					)}
					<AtomFieldRow label="Network" isMuted>
						<network.Icon className="size-3.5 shrink-0" />
						<span className="shrink-0 font-medium">{network.label}</span>
						<span
							className="min-w-0 truncate text-tertiary-foreground"
							title={network.hint}
						>
							{network.hint}
						</span>
					</AtomFieldRow>
					<div
						className={cn(TABLE_TRAY_SURFACE_DIVIDER_CLASS, "bg-destructive/5")}
					>
						<SettingsListRow
							title="Delete this Atom"
							description="Removes it from Autumn, then walks you through deleting its stack in AWS."
						>
							<Button
								variant="secondary"
								size="mini"
								className="border-red-500/40 bg-red-500/10 text-red-500 hover:bg-red-500/15"
								onClick={onDelete}
							>
								<TrashIcon className="size-3.5" />
								Delete Atom
							</Button>
						</SettingsListRow>
					</div>
				</div>
			)}
		</div>
	);
};
