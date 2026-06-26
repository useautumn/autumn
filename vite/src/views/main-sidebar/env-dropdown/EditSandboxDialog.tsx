import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	ShortcutButton,
} from "@autumn/ui";
import { useState } from "react";
import { toast } from "sonner";
import {
	type SandboxSummary,
	useUpdateSandbox,
} from "@/hooks/queries/useSandboxesQuery";
import { validateSandboxName } from "@/hooks/sandbox/sandboxUrl";
import { getBackendErr } from "@/utils/genUtils";
import { SandboxFormFields } from "./SandboxFormFields";

export const EditSandboxDialog = ({
	sandbox,
	open,
	setOpen,
}: {
	sandbox: SandboxSummary;
	open: boolean;
	setOpen: (open: boolean) => void;
}) => {
	const updateSandbox = useUpdateSandbox();
	const [name, setName] = useState(sandbox.name);
	const [color, setColor] = useState(sandbox.color);
	const [icon, setIcon] = useState(sandbox.icon);

	const handleSave = async () => {
		const trimmed = name.trim();
		if (!trimmed) {
			return;
		}
		const nameError = validateSandboxName(trimmed);
		if (nameError) {
			toast.error(nameError);
			return;
		}

		try {
			await updateSandbox.mutateAsync({
				id: sandbox.id,
				name: trimmed,
				color,
				icon,
			});
			toast.success("Sandbox updated");
			setOpen(false);
		} catch (error) {
			toast.error(getBackendErr(error, "Failed to update sandbox"));
		}
	};

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogContent className="w-[400px] bg-card">
				<DialogHeader>
					<DialogTitle>Edit sandbox</DialogTitle>
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
						onClick={handleSave}
						isLoading={updateSandbox.isPending}
						disabled={!name.trim()}
						metaShortcut="enter"
						className="w-full"
					>
						Save
					</ShortcutButton>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
};
