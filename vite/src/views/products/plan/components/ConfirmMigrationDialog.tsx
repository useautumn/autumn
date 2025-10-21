import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/v2/buttons/Button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/v2/dialogs/Dialog";
import { Input } from "@/components/v2/inputs/Input";
import { useProductStore } from "@/hooks/stores/useProductStore";

export const ConfirmMigrationDialog = ({
	open,
	setOpen,
	startMigration,
	version,
}: {
	open: boolean;
	setOpen: (open: boolean) => void;
	startMigration: () => Promise<void>;
	version: number;
}) => {
	const product = useProductStore((s) => s.product);
	const [confirmText, setConfirmText] = useState("");
	const [isLoading, setIsLoading] = useState(false);

	const handleMigrate = async () => {
		if (confirmText !== product.id) {
			toast.error("Confirmation text is incorrect");
			return;
		}

		setIsLoading(true);
		try {
			await startMigration();
			setOpen(false);
			setConfirmText("");
		} catch (_error) {
			// Error handling is done in startMigration
		} finally {
			setIsLoading(false);
		}
	};

	const handleOpenChange = (newOpen: boolean) => {
		if (!isLoading) {
			setOpen(newOpen);
			if (!newOpen) {
				setConfirmText("");
			}
		}
	};

	return (
		<Dialog open={open} onOpenChange={handleOpenChange}>
			<DialogContent onClick={(e) => e.stopPropagation()}>
				<DialogHeader className="max-w-full">
					<DialogTitle className="truncate max-w-[400px]">
						Migrate customers?
					</DialogTitle>
					<DialogDescription className="max-w-[400px] break-words flex flex-col gap-3">
						<p>
							This will migrate all customers on {product.name} (version{" "}
							{version}) to the latest version. Custom plans and cancelled plans
							will not be migrated.
						</p>
						<p>
							Type <code className="font-mono font-semibold">{product.id}</code>{" "}
							to continue.
						</p>
					</DialogDescription>
				</DialogHeader>

				<Input
					value={confirmText}
					onChange={(e) => setConfirmText(e.target.value)}
					type="text"
					placeholder={product.id}
					className="w-full"
				/>

				<DialogFooter>
					<Button
						variant="secondary"
						onClick={() => handleOpenChange(false)}
						disabled={isLoading}
					>
						Cancel
					</Button>
					<Button
						variant="primary"
						onClick={handleMigrate}
						isLoading={isLoading}
					>
						Start migration
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
};
