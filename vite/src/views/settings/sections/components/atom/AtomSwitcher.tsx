import type { ApiByocCache } from "@autumn/shared";
import {
	Button,
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
	Skeleton,
	StatusChipIcon,
} from "@autumn/ui";
import { CaretUpDownIcon, CheckIcon, PlusIcon } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { atomDisplayName, atomStatusChip } from "./atomDisplay";

/** Which of the section's three views is showing. */
export type AtomView = "list" | "new" | "detail";

/** Moves between the env's Atoms from any one of them, or to a new one while the cap allows. */
const AtomSwitcher = ({
	atoms,
	selectedId,
	canCreate,
	onSelect,
	onCreate,
}: {
	atoms: ApiByocCache[];
	selectedId: string;
	canCreate: boolean;
	onSelect: (atomId: string) => void;
	onCreate: () => void;
}) => {
	const selected = atoms.find(({ id }) => id === selectedId);
	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button variant="secondary" size="mini" className="gap-1.5">
					{selected && <StatusChipIcon {...atomStatusChip(selected)} />}
					{selected ? atomDisplayName(selected) : "Atom"}
					<CaretUpDownIcon className="size-3 text-subtle" />
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="start" className="w-72">
				<DropdownMenuGroup>
					<DropdownMenuLabel className="text-subtle text-xs">
						Atoms in this environment
					</DropdownMenuLabel>
					{atoms.map((cache) => (
						<DropdownMenuItem
							key={cache.id}
							onClick={() => onSelect(cache.id)}
							className="gap-2"
						>
							<StatusChipIcon {...atomStatusChip(cache)} />
							<span className="flex min-w-0 flex-1 flex-col">
								<span className="truncate">{atomDisplayName(cache)}</span>
								<span className="truncate font-mono text-subtle text-xs">
									{cache.stack_name}
								</span>
							</span>
							{cache.id === selectedId && (
								<CheckIcon className="size-3.5 text-primary" />
							)}
						</DropdownMenuItem>
					))}
				</DropdownMenuGroup>
				<DropdownMenuSeparator />
				<DropdownMenuItem
					disabled={!canCreate}
					onClick={onCreate}
					className="gap-2 text-primary"
				>
					<PlusIcon className="size-3.5" />
					New Atom
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
};

/** One row of the same height in every view and while loading, so the content below never moves when it fills in. */
export const AtomBreadcrumb = ({
	view,
	atoms,
	selectedId,
	isLoading,
	canCreate,
	onSelect,
	onCreate,
	onShowAll,
}: {
	view: AtomView;
	atoms: ApiByocCache[];
	selectedId: string | null;
	isLoading: boolean;
	canCreate: boolean;
	onSelect: (atomId: string) => void;
	onCreate: () => void;
	onShowAll: () => void;
}) => {
	const canShowAll = view !== "list" && atoms.length > 0;
	return (
		<div className="flex h-7 items-center gap-1.5 text-sm">
			<button
				type="button"
				disabled={!canShowAll}
				onClick={onShowAll}
				className={cn(
					canShowAll
						? "text-tertiary-foreground hover:text-foreground"
						: "font-medium text-foreground",
				)}
			>
				All Atoms
			</button>
			{view !== "list" && <span className="text-subtle">/</span>}
			{view === "new" && <span className="font-medium">New Atom</span>}
			{view === "detail" &&
				(isLoading || !selectedId ? (
					<Skeleton className="h-6 w-28" />
				) : (
					<AtomSwitcher
						atoms={atoms}
						selectedId={selectedId}
						canCreate={canCreate}
						onSelect={onSelect}
						onCreate={onCreate}
					/>
				))}
		</div>
	);
};
