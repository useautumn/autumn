import type { ApiByocCache } from "@autumn/shared";
import {
	Button,
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
	SheetTrigger,
	StatusChipIcon,
} from "@autumn/ui";
import { CaretRightIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { AtomRemoval, AtomRemoved } from "./AtomRemoval";
import {
	ATOM_ACTION_IN_AWS_CHIP,
	ATOM_REMOVING_CHIP,
	ATOM_STAGE_STATUS_CHIPS,
	isAtomRemovalWaitingOnYou,
} from "./atomDisplay";

/** Atoms that finish removing while this page is open stay as Removed until dismissed. */
const useRemovedAtoms = (removing: ApiByocCache[]) => {
	const [seen, setSeen] = useState<ApiByocCache[]>([]);
	const [dismissedIds, setDismissedIds] = useState<string[]>([]);
	const unseen = removing.filter(
		({ id }) => !seen.some((atom) => atom.id === id),
	);
	if (unseen.length) setSeen([...seen, ...unseen]);
	return {
		removed: seen.filter(
			({ id }) =>
				!removing.some((atom) => atom.id === id) && !dismissedIds.includes(id),
		),
		dismiss: (id: string) => setDismissedIds([...dismissedIds, id]),
	};
};

/** Amber while any delete waits on you, under way while the rest run, done once only removed ones are left. */
const removalsChip = (removing: ApiByocCache[]) => {
	if (removing.some(isAtomRemovalWaitingOnYou)) return ATOM_ACTION_IN_AWS_CHIP;
	return removing.length ? ATOM_REMOVING_CHIP : ATOM_STAGE_STATUS_CHIPS.done;
};

const previousAtoms = (count: number) =>
	`${count} previous Atom${count === 1 ? "" : "s"}`;

/** A header badge counting earlier Atoms still coming down; it opens a sheet with each one's steps. */
export const AtomRemovalSheet = ({
	removing,
}: {
	removing: ApiByocCache[];
}) => {
	const { removed, dismiss } = useRemovedAtoms(removing);
	if (!removing.length && !removed.length) return null;

	const chip = removalsChip(removing);
	const isWaitingOnYou = chip === ATOM_ACTION_IN_AWS_CHIP;

	return (
		<Sheet>
			<SheetTrigger asChild>
				<Button
					variant="secondary"
					size="mini"
					className={cn(
						"shrink-0 gap-2",
						isWaitingOnYou &&
							"border-amber-500/25 bg-amber-500/5 text-amber-500 hover:bg-amber-500/10",
					)}
				>
					<StatusChipIcon tone={chip.tone} glyph={chip.glyph} />
					{removing.length
						? `Removing ${previousAtoms(removing.length)}`
						: `Removed ${previousAtoms(removed.length)}`}
					<CaretRightIcon className="size-3" />
				</Button>
			</SheetTrigger>
			<SheetContent>
				<SheetHeader className="pr-12">
					<SheetTitle>Previous Atoms</SheetTitle>
					<SheetDescription>
						Deleted Atoms finish removing once their stack is gone from AWS.
					</SheetDescription>
				</SheetHeader>
				<div className="flex min-h-0 flex-col gap-3 overflow-y-auto px-4 pb-4">
					{removing.map((cache) => (
						<AtomRemoval key={cache.id} cache={cache} />
					))}
					{removed.map((cache) => (
						<AtomRemoved
							key={cache.id}
							cache={cache}
							onDismiss={() => dismiss(cache.id)}
						/>
					))}
				</div>
			</SheetContent>
		</Sheet>
	);
};
