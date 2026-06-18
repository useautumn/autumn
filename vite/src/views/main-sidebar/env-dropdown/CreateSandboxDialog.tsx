import { useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { ShortcutButton } from "@/components/v2/buttons/ShortcutButton";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/v2/dialogs/Dialog";
import { FormLabel as FieldLabel } from "@/components/v2/form/FormLabel";
import { Input } from "@/components/v2/inputs/Input";
import { useCreateSandbox } from "@/hooks/queries/useSandboxesQuery";
import { setActiveSandbox } from "@/hooks/sandbox/useActiveSandbox";
import { getBackendErr } from "@/utils/genUtils";

export const CreateSandboxDialog = ({
	open,
	onOpenChange,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) => {
	const navigate = useNavigate();
	const createSandbox = useCreateSandbox();
	const [name, setName] = useState("");

	const handleCreate = async () => {
		const trimmed = name.trim();
		if (!trimmed) return;

		try {
			const sandbox = await createSandbox.mutateAsync(trimmed);
			setActiveSandbox({ id: sandbox.id, name: sandbox.name });
			toast.success("Sandbox created");
			setName("");
			onOpenChange(false);
			navigate("/sandbox/products");
		} catch (error) {
			toast.error(getBackendErr(error, "Failed to create sandbox"));
		}
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="w-[400px] bg-card">
				<DialogHeader>
					<DialogTitle>New sandbox</DialogTitle>
					<DialogDescription>
						An isolated test environment with its own data and API keys.
					</DialogDescription>
				</DialogHeader>
				<div>
					<FieldLabel>Name</FieldLabel>
					<Input
						placeholder="Staging"
						value={name}
						onChange={(e) => setName(e.target.value)}
					/>
				</div>
				<DialogFooter>
					<ShortcutButton
						variant="primary"
						onClick={handleCreate}
						isLoading={createSandbox.isPending}
						disabled={!name.trim()}
						metaShortcut="enter"
						className="w-full"
					>
						Create sandbox
					</ShortcutButton>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
};
