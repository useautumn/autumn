import { DEFAULT_SANDBOX_COLOR, DEFAULT_SANDBOX_ICON } from "@autumn/shared";
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
import { useCreateSandbox } from "@/hooks/queries/useSandboxesQuery";
import { setActiveSandbox } from "@/hooks/sandbox/useActiveSandbox";
import { getBackendErr } from "@/utils/genUtils";
import { SandboxFormFields } from "./SandboxFormFields";

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
	const [color, setColor] = useState<string>(DEFAULT_SANDBOX_COLOR);
	const [icon, setIcon] = useState<string>(DEFAULT_SANDBOX_ICON);

	const resetSelections = () => {
		setName("");
		setColor(DEFAULT_SANDBOX_COLOR);
		setIcon(DEFAULT_SANDBOX_ICON);
	};

	const handleOpenChange = (next: boolean) => {
		if (!next) {
			resetSelections();
		}
		onOpenChange(next);
	};

	const handleCreate = async () => {
		const trimmed = name.trim();
		if (!trimmed) {
			return;
		}

		try {
			const sandbox = await createSandbox.mutateAsync({
				name: trimmed,
				color,
				icon,
			});
			setActiveSandbox({
				id: sandbox.id,
				name: sandbox.name,
				color: sandbox.color,
				icon: sandbox.icon,
			});
			toast.success("Sandbox created");
			resetSelections();
			onOpenChange(false);
			navigate("/sandbox/products");
		} catch (error) {
			toast.error(getBackendErr(error, "Failed to create sandbox"));
		}
	};

	return (
		<Dialog open={open} onOpenChange={handleOpenChange}>
			<DialogContent className="w-[400px] bg-card">
				<DialogHeader>
					<DialogTitle>New sandbox</DialogTitle>
					<DialogDescription>
						An isolated test environment with its own data and API keys.
					</DialogDescription>
				</DialogHeader>
				<SandboxFormFields
					name={name}
					onNameChange={setName}
					color={color}
					onColorChange={setColor}
					icon={icon}
					onIconChange={setIcon}
				/>
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
