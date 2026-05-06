import type { AxiosError } from "axios";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ShortcutButton } from "@/components/v2/buttons/ShortcutButton";
import { Input } from "@/components/v2/inputs/Input";
import {
	SheetFooter,
	SheetHeader,
	SheetSection,
} from "@/components/v2/sheets/SharedSheetComponents";
import { Sheet, SheetContent } from "@/components/v2/sheets/Sheet";
import { useMigrationsQuery } from "@/hooks/queries/useMigrationsQuery";
import { MigrationService } from "@/services/MigrationService";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { getBackendErr } from "@/utils/genUtils";

function CreateMigrationSheet({
	open: controlledOpen,
	onOpenChange: controlledOnOpenChange,
	onSuccess,
}: {
	open?: boolean;
	onOpenChange?: (open: boolean) => void;
	onSuccess?: (migrationId: string) => void;
} = {}) {
	const [loading, setLoading] = useState(false);
	const [internalOpen, setInternalOpen] = useState(false);
	const [id, setId] = useState("");

	const open = controlledOpen !== undefined ? controlledOpen : internalOpen;
	const setOpen = controlledOnOpenChange || setInternalOpen;

	const axiosInstance = useAxiosInstance();
	const { refetch } = useMigrationsQuery();

	const handleCreateMigration = async () => {
		if (!id.trim()) {
			toast.error("Migration ID is required");
			return;
		}

		setLoading(true);
		try {
			const created = await MigrationService.create(axiosInstance, {
				id: id.trim(),
			});
			await refetch();
			toast.success("Migration created");
			setOpen(false);
			onSuccess?.(created.id);
		} catch (error: unknown) {
			toast.error(
				getBackendErr(error as AxiosError, "Failed to create migration"),
			);
		} finally {
			setLoading(false);
		}
	};

	const handleCancel = () => setOpen(false);

	useEffect(() => {
		if (open) setId("");
	}, [open]);

	return (
		<Sheet open={open} onOpenChange={setOpen}>
			<SheetContent className="flex flex-col overflow-hidden">
				<SheetHeader
					title="Create a migration"
					description="Give your migration a unique ID. You can configure its filter and operations after creation."
				/>

				<div className="flex-1 overflow-y-auto">
					<SheetSection title="Migration ID">
						<Input
							placeholder="add-credits-to-free"
							value={id}
							onChange={(e) => setId(e.target.value)}
						/>
					</SheetSection>
				</div>

				<SheetFooter>
					<ShortcutButton
						variant="secondary"
						className="w-full"
						onClick={handleCancel}
						singleShortcut="escape"
					>
						Cancel
					</ShortcutButton>
					<ShortcutButton
						className="w-full"
						onClick={handleCreateMigration}
						metaShortcut="enter"
						isLoading={loading}
					>
						Create migration
					</ShortcutButton>
				</SheetFooter>
			</SheetContent>
		</Sheet>
	);
}

export default CreateMigrationSheet;
