import type { ApiByocCache } from "@autumn/shared";
import {
	Button,
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
	IconButton,
} from "@autumn/ui";
import {
	ArrowSquareOutIcon,
	CopyIcon,
	DotsThreeIcon,
	TrashIcon,
} from "@phosphor-icons/react";
import { format } from "date-fns";
import { toast } from "sonner";
import { TABLE_TRAY_SURFACE_CLASS } from "@/components/general/table";
import { useAtomQuery } from "@/hooks/queries/useAtomQuery";
import { cn } from "@/lib/utils";
import { AtomCopyValue } from "./AtomCopyValue";
import { AtomStatusChip } from "./AtomStatusChip";
import {
	ATOM_PAGE_CARD_CLASS,
	ATOM_PAGE_CARD_SURFACE_CELL_CLASS,
	ATOM_PAGE_CARD_TRAY_ROW_CLASS,
} from "./atomCardLayout";
import { ATOM_CONNECTED_CHIP, awsStackConsoleUrl } from "./atomDisplay";
import { atomMachineSpecs, cacheToMachine } from "./atomMachineDisplay";
import { atomNetwork } from "./atomNetworkDisplay";
import { awsRegionLabel } from "./atomRegionDisplay";

const NO_VALUE = "—";

/** One labelled value; a cell after the first in its row draws the divider, which takes 1px of its inset. */
const DetailCell = ({
	label,
	hasDivider = false,
	className,
	children,
}: {
	label: string;
	hasDivider?: boolean;
	className?: string;
	children: React.ReactNode;
}) => (
	<div
		className={cn(
			"flex h-18 min-w-0 flex-col justify-center gap-1.5",
			ATOM_PAGE_CARD_SURFACE_CELL_CLASS,
			hasDivider && "border-l border-table-row-divider pl-[13px]",
			className,
		)}
	>
		<span className="text-xs text-subtle">{label}</span>
		<div className="flex h-6 min-w-0 items-center gap-2 text-sm text-foreground">
			{children}
		</div>
	</div>
);

const copyToClipboard = ({ text, label }: { text: string; label: string }) => {
	navigator.clipboard.writeText(text);
	toast.success(`${label} copied`);
};

/** Copying what the cards show, and deleting this Atom. */
const AtomDetailsMenu = ({
	url,
	stackName,
	onDelete,
}: {
	url: string | null;
	stackName: string;
	onDelete: () => void;
}) => (
	<DropdownMenu>
		<DropdownMenuTrigger asChild>
			<IconButton
				aria-label="Atom actions"
				variant="secondary"
				size="icon"
				className="size-6 justify-center"
				icon={<DotsThreeIcon className="size-3.5" />}
			/>
		</DropdownMenuTrigger>
		<DropdownMenuContent align="end" className="w-72">
			{url && (
				<DropdownMenuItem
					onClick={() => copyToClipboard({ text: url, label: "URL" })}
				>
					<CopyIcon className="text-tertiary-foreground" />
					Copy URL
				</DropdownMenuItem>
			)}
			<DropdownMenuItem
				onClick={() =>
					copyToClipboard({ text: stackName, label: "Stack name" })
				}
			>
				<CopyIcon className="text-tertiary-foreground" />
				Copy stack name
			</DropdownMenuItem>
			<DropdownMenuSeparator />
			<DropdownMenuItem
				variant="destructive"
				className="items-start"
				onClick={onDelete}
			>
				<TrashIcon className="mt-0.5" />
				<span className="flex flex-col gap-0.5">
					Delete Atom…
					<span className="text-xs text-tertiary-foreground">
						Removes it from Autumn, then walks you through deleting its stack in
						AWS.
					</span>
				</span>
			</DropdownMenuItem>
		</DropdownMenuContent>
	</DropdownMenu>
);

/** The connected Atom: its status and actions on the tray, where it runs and how to reach it beneath. */
export const AtomDetails = ({
	cache,
	onDelete,
}: {
	cache: ApiByocCache;
	onDelete: () => void;
}) => {
	const { checkedAt } = useAtomQuery();
	const machine = cacheToMachine(cache);
	const network = atomNetwork(cache);
	const { stack_name: stackName, region, endpoint_url: url } = cache;

	return (
		<div className={ATOM_PAGE_CARD_CLASS}>
			<div
				className={cn(
					"flex h-11 items-center justify-between gap-4",
					ATOM_PAGE_CARD_TRAY_ROW_CLASS,
				)}
			>
				<div className="flex items-center gap-2.5">
					<AtomStatusChip chip={ATOM_CONNECTED_CHIP} />
					{checkedAt > 0 && (
						<span className="text-sm text-subtle">
							Checked {format(checkedAt, "HH:mm")}
						</span>
					)}
				</div>
				<div className="flex items-center gap-2">
					<Button variant="secondary" size="mini" asChild>
						<a
							href={awsStackConsoleUrl({ stackName, region })}
							target="_blank"
							rel="noreferrer"
						>
							Open in AWS
							<ArrowSquareOutIcon className="size-3.5" />
						</a>
					</Button>
					<AtomDetailsMenu
						url={url}
						stackName={stackName}
						onDelete={onDelete}
					/>
				</div>
			</div>
			<div
				className={cn(TABLE_TRAY_SURFACE_CLASS, "grid grid-cols-[3fr_3fr_2fr]")}
			>
				<DetailCell label="URL" className="border-b border-table-row-divider">
					{url ? <AtomCopyValue text={url} /> : NO_VALUE}
				</DetailCell>
				<DetailCell
					label="Stack name"
					hasDivider
					className="border-b border-table-row-divider"
				>
					<AtomCopyValue text={stackName} />
				</DetailCell>
				<DetailCell
					label="Region"
					hasDivider
					className="border-b border-table-row-divider"
				>
					{region ? (
						<>
							<span className="shrink-0 font-mono text-xs">{region}</span>
							<span
								className="truncate text-subtle"
								title={awsRegionLabel(region)}
							>
								{awsRegionLabel(region)}
							</span>
						</>
					) : (
						NO_VALUE
					)}
				</DetailCell>
				<DetailCell label="Machine">
					{machine ? atomMachineSpecs(machine) : NO_VALUE}
				</DetailCell>
				<DetailCell label="Network" hasDivider className="col-span-2">
					<span className="shrink-0 font-medium">{network.label}</span>
					<span className="truncate text-subtle" title={network.hint}>
						{network.hint}
					</span>
				</DetailCell>
			</div>
		</div>
	);
};
