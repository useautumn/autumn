import { useState } from "react";
import { toast } from "sonner";
import { getBackendErr } from "@/utils/genUtils";
import { AtomDeleteDialog, type AtomDeletePrompt } from "./AtomDeleteDialog";
import type { AtomActions } from "./useAtomActions";

export const useAtomDeleteDialog = ({
	hasStack,
	stackName,
	remove,
	onNoStack,
}: {
	hasStack: boolean;
	stackName: string;
	remove: AtomActions["remove"];
	onNoStack: () => void;
}) => {
	const [prompt, setPrompt] = useState<AtomDeletePrompt | null>(null);

	const askToDelete = (next: AtomDeletePrompt) => {
		if (hasStack) setPrompt(next);
		else onNoStack();
	};

	const confirmDelete = () =>
		remove.mutate(
			{},
			{
				onSuccess: () => setPrompt(null),
				onError: (error) =>
					toast.error(getBackendErr(error, "Failed to delete Atom")),
			},
		);

	const deleteDialog = (
		<AtomDeleteDialog
			prompt={prompt}
			stackName={stackName}
			onOpenChange={(open) => !open && setPrompt(null)}
			onConfirm={confirmDelete}
			isDeleting={remove.isPending}
		/>
	);

	return { askToDelete, deleteDialog };
};
