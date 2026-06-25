import {
	Button,
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@autumn/ui";
import { toast } from "sonner";
import {
	type MigrationWithRunInfo,
	useMigrationsQuery,
} from "@/hooks/queries/useMigrationsQuery";

export function DeleteMigrationDialog({
	migration,
	open,
	onOpenChange,
}: {
	migration: MigrationWithRunInfo;
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const { deleteMigration, isDeleting } = useMigrationsQuery();

	const handleDelete = async () => {
		try {
			await deleteMigration({ id: migration.id });
			toast.success(`Migration ${migration.id} deleted`);
			onOpenChange(false);
		} catch {
			toast.error("Failed to delete migration");
		}
	};

	return (
		<Dialog
			open={open}
			onOpenChange={(nextOpen) => !isDeleting && onOpenChange(nextOpen)}
		>
			<DialogContent className="max-w-md">
				<DialogHeader>
					<DialogTitle className="truncate">Delete {migration.id}</DialogTitle>
					<DialogDescription>
						This migration will be permanently deleted. This action cannot be
						undone.
					</DialogDescription>
				</DialogHeader>
				<DialogFooter>
					<Button
						variant="secondary"
						onClick={() => onOpenChange(false)}
						disabled={isDeleting}
					>
						Cancel
					</Button>
					<Button
						variant="destructive"
						onClick={handleDelete}
						isLoading={isDeleting}
					>
						Delete
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
