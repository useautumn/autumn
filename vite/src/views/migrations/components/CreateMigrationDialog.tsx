import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	Input,
	ShortcutButton,
} from "@autumn/ui";
import type { AxiosError } from "axios";
import { useCallback, useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { useMigrationsQuery } from "@/hooks/queries/useMigrationsQuery";
import { getBackendErr, navigateTo } from "@/utils/genUtils";
import { migrationUid } from "@/views/migrations/migration/shared/operationUtils";

export function CreateMigrationDialog({
	open: controlledOpen,
	onOpenChange: controlledOnOpenChange,
}: {
	open?: boolean;
	onOpenChange?: (open: boolean) => void;
} = {}) {
	const [internalOpen, setInternalOpen] = useState(false);
	const [id, setId] = useState("");
	const navigate = useNavigate();

	const open = controlledOpen !== undefined ? controlledOpen : internalOpen;
	const generateId = useCallback(() => `migration-${migrationUid()}`, []);
	const handleOpenChange = (nextOpen: boolean) => {
		if (nextOpen) setId(generateId());
		(controlledOnOpenChange || setInternalOpen)(nextOpen);
	};

	const { createMigration, isCreating } = useMigrationsQuery();

	const handleCreateMigration = async () => {
		if (!id.trim()) {
			toast.error("Migration ID is required");
			return;
		}
		try {
			const created = await createMigration({ id: id.trim() });
			toast.success("Migration created");
			handleOpenChange(false);
			navigateTo(`/migrations/${created.id}`, navigate);
		} catch (error: unknown) {
			toast.error(
				getBackendErr(error as AxiosError, "Failed to create migration"),
			);
		}
	};

	return (
		<Dialog open={open} onOpenChange={handleOpenChange}>
			<DialogContent showCloseButton={false}>
				<DialogHeader>
					<DialogTitle>Create a migration</DialogTitle>
					<DialogDescription>
						Give your migration a unique ID. You can configure its filter and
						operations after creation.
					</DialogDescription>
				</DialogHeader>

				<div className="flex flex-col gap-1.5">
					<label htmlFor="migration-id" className="text-sm font-medium">
						Migration ID
					</label>
					<Input
						id="migration-id"
						placeholder="migration-abc123"
						value={id}
						onChange={(e) => setId(e.target.value)}
					/>
				</div>

				<DialogFooter>
					<ShortcutButton
						className="w-full"
						onClick={handleCreateMigration}
						metaShortcut="enter"
						isLoading={isCreating}
					>
						Create migration
					</ShortcutButton>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
