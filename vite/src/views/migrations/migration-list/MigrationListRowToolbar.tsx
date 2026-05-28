import {
	ArrowCounterClockwiseIcon,
	CheckCircleIcon,
	TrashIcon,
} from "@phosphor-icons/react";
import { useState } from "react";
import { toast } from "sonner";
import { ToolbarButton } from "@/components/general/table-components/ToolbarButton";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/v2/dropdowns/DropdownMenu";
import {
	useMigrationsQuery,
	type MigrationWithRunInfo,
} from "@/hooks/queries/useMigrationsQuery";

export function MigrationListRowToolbar({
	migration,
}: {
	migration: MigrationWithRunInfo;
}) {
	const [dropdownOpen, setDropdownOpen] = useState(false);
	const { updateMigration, deleteMigration } = useMigrationsQuery();

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

	const handleDelete = async () => {
		setDropdownOpen(false);
		try {
			await deleteMigration({ id: migration.id });
			toast.success(`Migration ${migration.id} deleted`);
		} catch {
			toast.error("Failed to delete migration");
		}
	};

	return (
		<DropdownMenu open={dropdownOpen} onOpenChange={setDropdownOpen}>
			<div
				onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
				onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
			>
				<DropdownMenuTrigger asChild>
					<ToolbarButton />
				</DropdownMenuTrigger>
			</div>
			<DropdownMenuContent align="end">
				{migration.archived ? (
					<DropdownMenuItem
						className="flex gap-2"
						onClick={(e) => {
							e.stopPropagation();
							e.preventDefault();
							handleArchiveToggle();
						}}
					>
						<ArrowCounterClockwiseIcon />
						Unarchive
					</DropdownMenuItem>
				) : migration.has_live_runs ? (
					<DropdownMenuItem
						className="flex gap-2"
						onClick={(e) => {
							e.stopPropagation();
							e.preventDefault();
							handleArchiveToggle();
						}}
					>
						<CheckCircleIcon />
						Mark as complete
					</DropdownMenuItem>
				) : (
					<DropdownMenuItem
						className="flex gap-2"
						onClick={(e) => {
							e.stopPropagation();
							e.preventDefault();
							handleDelete();
						}}
					>
						<TrashIcon />
						Delete
					</DropdownMenuItem>
				)}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
