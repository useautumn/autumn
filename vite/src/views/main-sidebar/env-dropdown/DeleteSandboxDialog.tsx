import { useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import {
	Button,
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	Input,
} from "@autumn/ui";
import {
	type SandboxSummary,
	useDeleteSandbox,
} from "@/hooks/queries/useSandboxesQuery";
import {
	setActiveSandbox,
	useActiveSandbox,
} from "@/hooks/sandbox/useActiveSandbox";
import { getBackendErr } from "@/utils/genUtils";

export const DeleteSandboxDialog = ({
	sandbox,
	open,
	setOpen,
}: {
	sandbox: SandboxSummary;
	open: boolean;
	setOpen: (open: boolean) => void;
}) => {
	const navigate = useNavigate();
	const activeSandbox = useActiveSandbox();
	const deleteSandbox = useDeleteSandbox();
	const [confirmText, setConfirmText] = useState("");

	const handleDelete = async () => {
		if (confirmText !== sandbox.name) {
			return;
		}

		try {
			await deleteSandbox.mutateAsync(sandbox.id);
			if (activeSandbox?.id === sandbox.id) {
				setActiveSandbox(null);
				navigate("/sandbox/products");
			}
			toast.success("Sandbox deleted");
			setOpen(false);
		} catch (error) {
			toast.error(getBackendErr(error, "Failed to delete sandbox"));
		}
	};

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogContent className="bg-card">
				<DialogHeader>
					<DialogTitle>Delete sandbox</DialogTitle>
					<DialogDescription>
						This permanently deletes the sandbox and all its data, API keys, and
						webhooks. Type <span className="font-bold">"{sandbox.name}"</span>{" "}
						to confirm.
					</DialogDescription>
				</DialogHeader>
				<Input
					type="text"
					placeholder={`Type "${sandbox.name}" to confirm`}
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
						variant="destructive"
						onClick={handleDelete}
						isLoading={deleteSandbox.isPending}
						disabled={confirmText !== sandbox.name}
					>
						Delete
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
};
