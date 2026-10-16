import type { ApiByocCache } from "@autumn/shared";
import { CaretRightIcon } from "@phosphor-icons/react";
import { TABLE_TRAY_SURFACE_CLASS } from "@/components/general/table";
import { cn } from "@/lib/utils";
import { AtomStatusChip } from "./AtomStatusChip";
import {
	ATOM_PAGE_CARD_CLASS,
	ATOM_PAGE_CARD_TRAY_ROW_CLASS,
} from "./atomCardLayout";
import { atomDisplayName, atomStatusChip } from "./atomDisplay";
import { atomMachineSpecs, cacheToMachine } from "./atomMachineDisplay";

const COLUMNS = "grid grid-cols-[2fr_1.2fr_1.3fr_2fr_16px] items-center gap-4";
const NO_VALUE = <span className="text-subtle">—</span>;

const AtomRow = ({
	cache,
	onOpen,
}: {
	cache: ApiByocCache;
	onOpen: () => void;
}) => {
	const machine = cacheToMachine(cache);
	return (
		<button
			type="button"
			onClick={onOpen}
			className={cn(
				COLUMNS,
				"h-15 w-full border-table-row-divider border-b px-3.5 text-left text-sm last:border-b-0 hover:bg-table-row-hover",
			)}
		>
			<span className="flex min-w-0 flex-col gap-0.5">
				<span className="truncate font-medium">{atomDisplayName(cache)}</span>
				<span className="truncate font-mono text-subtle text-xs">
					{cache.stack_name}
				</span>
			</span>
			<span className="flex min-w-0 flex-col gap-0.5">
				<span className="truncate">{cache.region ?? NO_VALUE}</span>
				<span className="truncate text-subtle text-xs">
					{machine ? atomMachineSpecs(machine) : ""}
				</span>
			</span>
			<span>
				<AtomStatusChip chip={atomStatusChip(cache)} />
			</span>
			<span className="truncate font-mono text-tertiary-foreground text-xs">
				{cache.endpoint_url ?? NO_VALUE}
			</span>
			<CaretRightIcon className="size-3.5 text-subtle" />
		</button>
	);
};

/** The env's Atoms, oldest first; each opens on its own page. */
export const AtomList = ({
	atoms,
	maxAtoms,
	onOpen,
}: {
	atoms: ApiByocCache[];
	maxAtoms: number;
	onOpen: (atomId: string) => void;
}) => (
	<div className={ATOM_PAGE_CARD_CLASS}>
		<div className={TABLE_TRAY_SURFACE_CLASS}>
			<div
				className={cn(
					COLUMNS,
					"h-9 border-table-row-divider border-b px-3.5 text-subtle text-xs",
				)}
			>
				<span>Atom</span>
				<span>Region</span>
				<span>Status</span>
				<span>Endpoint</span>
				<span />
			</div>
			{atoms.map((cache) => (
				<AtomRow key={cache.id} cache={cache} onOpen={() => onOpen(cache.id)} />
			))}
		</div>
		<div
			className={cn(
				"flex h-10 items-center text-subtle text-xs",
				ATOM_PAGE_CARD_TRAY_ROW_CLASS,
			)}
		>
			{atoms.length} of {maxAtoms} Atom{maxAtoms === 1 ? "" : "s"} in this
			environment
		</div>
	</div>
);
