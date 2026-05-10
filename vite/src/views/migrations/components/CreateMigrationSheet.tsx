import type { AxiosError } from "axios";
import { useState } from "react";
import { useNavigate } from "react-router";
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
import { getBackendErr, navigateTo } from "@/utils/genUtils";

function CreateMigrationSheet({
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
	const handleOpenChange = (nextOpen: boolean) => {
		if (nextOpen) setId("");
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

	const handleCancel = () => handleOpenChange(false);

	return (
		<Sheet open={open} onOpenChange={handleOpenChange}>
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
						isLoading={isCreating}
					>
						Create migration
					</ShortcutButton>
				</SheetFooter>
			</SheetContent>
		</Sheet>
	);
}

export default CreateMigrationSheet;
