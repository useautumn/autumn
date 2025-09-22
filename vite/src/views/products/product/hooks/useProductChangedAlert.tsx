import React, { useState, useCallback } from "react";
import { useBlocker } from "./useBlocker";
import { NavigationBlockerModal } from "./NavigationBlockerModal";

export const useProductChangedAlert = ({
	hasChanges,
}: {
	hasChanges: boolean;
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

	useBlocker(hasChanges, showConfirmModal);

	const modal = React.createElement(NavigationBlockerModal, {
		isOpen: isModalOpen,
		onConfirm: handleConfirm,
		onCancel: handleCancel,
	});

	return { modal };
};
