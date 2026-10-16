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
	StatusChipIcon,
} from "@autumn/ui";
import { CaretUpDownIcon, CheckIcon, PlusIcon } from "@phosphor-icons/react";
import { atomDisplayName, atomStatusChip } from "./atomDisplay";

/** Moves between the env's Atoms from any one of them, or back to the list, or to a new one while the cap allows. */
export const AtomSwitcher = ({
	atoms,
	selectedId,
	canCreate,
	onSelect,
	onCreate,
	onShowAll,
}: {
	atoms: ApiByocCache[];
	selectedId: string;
	canCreate: boolean;
	onSelect: (atomId: string) => void;
	onCreate: () => void;
	onShowAll: () => void;
}) => {
	const selected = atoms.find(({ id }) => id === selectedId);
	return (
		<div className="flex items-center gap-1.5 text-sm">
			<button
				type="button"
				onClick={onShowAll}
				className="text-tertiary-foreground hover:text-foreground"
			>
				All Atoms
			</button>
			<span className="text-subtle">/</span>
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<Button variant="secondary" size="mini" className="gap-1.5">
						{selected && <StatusChipIcon {...atomStatusChip(selected)} />}
						{selected ? atomDisplayName(selected) : "New Atom"}
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
		</div>
	);
};
