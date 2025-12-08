import type { ApiKey } from "@autumn/shared";
import { useEffect, useState } from "react";
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
import { useDevQuery } from "@/hooks/queries/useDevQuery";
import { DevService } from "@/services/DevService";
import { useAxiosInstance } from "@/services/useAxiosInstance";

export const DeleteApiKeyDialog = ({
	apiKey,
	setOpen,
	open,
}: {
	apiKey: ApiKey;
	setOpen: (open: boolean) => void;
	open: boolean;
}) => {
	const { refetch } = useDevQuery();
	const axiosInstance = useAxiosInstance();
	const [confirmText, setConfirmText] = useState("");

	const [deleteLoading, setDeleteLoading] = useState(false);

	// Reset confirmText when dialog opens/closes
	useEffect(() => {
		if (open) {
			setConfirmText("");
		}
	}, [open]);

	const handleDelete = async () => {
		if (confirmText !== apiKey.name) {
			toast.error("Please type the correct API key name to confirm deletion");
			return;
		}

		setDeleteLoading(true);
		try {
			await DevService.deleteAPIKey(axiosInstance, apiKey.id);
			setOpen(false);
			await refetch();
		} catch (_error) {
			toast.error("Failed to delete API key");
		}
		setDeleteLoading(false);
	};

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Delete API Key</DialogTitle>
					<DialogDescription>
						To confirm the deletion of this API key, type{" "}
						<span className="font-bold">"{apiKey.name}"</span> below
					</DialogDescription>
				</DialogHeader>
				<Input
					type="text"
					placeholder={`Type "${apiKey.name}" to confirm`}
					className="w-full"
					value={confirmText}
					onChange={(e) => setConfirmText(e.target.value)}
					variant="destructive"
				/>
				<DialogFooter>
					<Button variant="secondary" onClick={() => setOpen(false)}>
						Cancel
					</Button>
					<Button
						onClick={handleDelete}
						isLoading={deleteLoading}
						variant="destructive"
					>
						Delete
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
};
