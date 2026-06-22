import { ToolbarButton } from "@autumn/ui";
import {
	ArrowCounterClockwiseIcon,
	CheckCircleIcon,
	TrashIcon,
} from "@phosphor-icons/react";
import type { MouseEvent } from "react";
import { useState } from "react";
import { toast } from "sonner";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/v2/dropdowns/DropdownMenu";
import {
	type MigrationWithRunInfo,
	useMigrationsQuery,
} from "@/hooks/queries/useMigrationsQuery";
import { DeleteMigrationDialog } from "./DeleteMigrationDialog";

export function MigrationListRowToolbar({
	migration,
}: {
	migration: MigrationWithRunInfo;
}) {
	const [dropdownOpen, setDropdownOpen] = useState(false);
	const [deleteOpen, setDeleteOpen] = useState(false);
	const { updateMigration } = useMigrationsQuery();

	const handleArchiveToggle = async () => {
		setDropdownOpen(false);
		const newArchived = !migration.archived;
		try {
			await updateMigration({
				id: migration.id,
				updates: { archived: newArchived },
			});
			toast.success(
				newArchived
					? `Migration ${migration.id} marked as complete`
					: `Migration ${migration.id} unarchived`,
			);
		} catch {
			toast.error(
				newArchived
					? "Failed to mark migration as complete"
					: "Failed to unarchive migration",
			);
		}
	};

	const openDeleteDialog = () => {
		setDropdownOpen(false);
		setDeleteOpen(true);
	};

	const menuAction = (() => {
		if (migration.archived) {
			return {
				icon: <ArrowCounterClockwiseIcon />,
				label: "Unarchive",
				onSelect: handleArchiveToggle,
			};
		}

		if (migration.has_live_runs) {
			return {
				icon: <CheckCircleIcon />,
				label: "Mark as complete",
				onSelect: handleArchiveToggle,
			};
		}

		return {
			icon: <TrashIcon />,
			label: "Delete",
			onSelect: openDeleteDialog,
		};
	})();

	const handleMenuSelect = (
		e: MouseEvent<HTMLDivElement>,
		action: () => void,
	) => {
		e.stopPropagation();
		e.preventDefault();
		action();
	};

	return (
		<>
			<DropdownMenu open={dropdownOpen} onOpenChange={setDropdownOpen}>
				<div
					onClick={(e) => {
						e.preventDefault();
						e.stopPropagation();
					}}
					onMouseDown={(e) => {
						e.preventDefault();
						e.stopPropagation();
					}}
				>
					<DropdownMenuTrigger asChild>
						<ToolbarButton />
					</DropdownMenuTrigger>
				</div>
				<DropdownMenuContent align="end">
					<DropdownMenuItem
						className="flex gap-2"
						onClick={(e) => handleMenuSelect(e, menuAction.onSelect)}
					>
						{menuAction.icon}
						{menuAction.label}
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
			<DeleteMigrationDialog
				migration={migration}
				open={deleteOpen}
				onOpenChange={setDeleteOpen}
			/>
		</>
	);
}
