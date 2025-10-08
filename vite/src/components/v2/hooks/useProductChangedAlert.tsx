import { useCallback, useState } from "react";
import { NavigationBlockerDialog } from "@/components/v2/dialogs/NavigationBlockerDialog";
import { useBlocker } from "@/views/products/product/hooks/useBlocker";

export const useProductChangedAlert = ({
	hasChanges,
	disabled = false,
}: {
	hasChanges: boolean;
	disabled?: boolean;
}) => {
	const [isModalOpen, setIsModalOpen] = useState(false);
	const [resolveConfirm, setResolveConfirm] = useState<
		((value: boolean) => void) | null
	>(null);

	const showConfirmModal = useCallback((): Promise<boolean> => {
		return new Promise((resolve) => {
			setResolveConfirm(() => resolve);
			setIsModalOpen(true);
		});
	}, []);

	const handleConfirm = useCallback(() => {
		setIsModalOpen(false);
		if (resolveConfirm) {
			resolveConfirm(true);
			setResolveConfirm(null);
		}
	}, [resolveConfirm]);

	const handleCancel = useCallback(() => {
		setIsModalOpen(false);
		if (resolveConfirm) {
			resolveConfirm(false);
			setResolveConfirm(null);
		}
	}, [resolveConfirm]);

	// Use the custom blocker that doesn't depend on React Router's data router
	useBlocker(hasChanges && !disabled, showConfirmModal);

	const modal = (
		<NavigationBlockerDialog
			isOpen={isModalOpen}
			onConfirm={handleConfirm}
			onCancel={handleCancel}
		/>
	);

	return { modal };
};
