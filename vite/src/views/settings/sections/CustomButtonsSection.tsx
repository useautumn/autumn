import type { CustomButton } from "@autumn/shared";
import { PlusIcon } from "@phosphor-icons/react";
import { AnimatePresence } from "motion/react";
import { useState } from "react";
import { Button } from "@/components/v2/buttons/Button";
import { SettingsSection } from "../SettingsSection";
import { CustomButtonDialog } from "./components/CustomButtonDialog";
import { CustomButtonRow } from "./components/CustomButtonRow";
import type { CustomButtonForm } from "./components/customButtonFormSchema";
import { DeleteCustomButtonDialog } from "./components/DeleteCustomButtonDialog";
import { useCustomButtons } from "./components/useCustomButtons";

interface DialogState {
	open: boolean;
	button: CustomButton | null;
	nonce: number;
}

interface DeleteDialogState {
	open: boolean;
	button: CustomButton | null;
}

export const CustomButtonsSection = () => {
	const { buttons, save, remove } = useCustomButtons();
	const [dialog, setDialog] = useState<DialogState>({
		open: false,
		button: null,
		nonce: 0,
	});
	const [deleteDialog, setDeleteDialog] = useState<DeleteDialogState>({
		open: false,
		button: null,
	});

	const openDialog = (button: CustomButton | null) =>
		setDialog((prev) => ({ open: true, button, nonce: prev.nonce + 1 }));

	const handleSubmit = (values: CustomButtonForm) =>
		save.mutate(
			{ id: dialog.button?.id ?? null, values },
			{ onSuccess: () => setDialog((prev) => ({ ...prev, open: false })) },
		);

	const handleDelete = () => {
		if (!deleteDialog.button) return;
		remove.mutate(deleteDialog.button.id, {
			onSuccess: () => setDeleteDialog((prev) => ({ ...prev, open: false })),
		});
	};

	return (
		<SettingsSection
			title="Custom Buttons"
			description="Add buttons to every customer page that link out to your own tools, like an internal dashboard."
			actions={
				<Button
					variant="secondary"
					size="mini"
					className="gap-2 font-medium shrink-0"
					onClick={() => openDialog(null)}
				>
					<PlusIcon className="size-3.5" />
					Add button
				</Button>
			}
		>
			{buttons.length === 0 ? (
				<div className="rounded-lg border border-dashed bg-interactive-secondary px-3 py-4 text-center text-xs text-tertiary-foreground">
					No custom buttons configured.
				</div>
			) : (
				<div className="flex flex-col gap-1.5">
					<AnimatePresence initial={false}>
						{buttons.map((button) => (
							<CustomButtonRow
								key={button.id}
								button={button}
								onEdit={() => openDialog(button)}
								onDelete={() => setDeleteDialog({ open: true, button })}
								isDeleting={
									remove.isPending && deleteDialog.button?.id === button.id
								}
							/>
						))}
					</AnimatePresence>
				</div>
			)}
			<CustomButtonDialog
				key={`${dialog.button?.id ?? "new"}-${dialog.nonce}`}
				open={dialog.open}
				onOpenChange={(open) => setDialog((prev) => ({ ...prev, open }))}
				initialButton={dialog.button ?? undefined}
				onSubmit={handleSubmit}
				isSaving={save.isPending}
			/>
			<DeleteCustomButtonDialog
				button={deleteDialog.button}
				open={deleteDialog.open}
				onOpenChange={(open) => setDeleteDialog((prev) => ({ ...prev, open }))}
				onConfirm={handleDelete}
				isDeleting={remove.isPending}
			/>
		</SettingsSection>
	);
};
