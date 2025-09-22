import { useState } from "react";

export const useContextMenu = () => {
	const [openKeyId, setOpenKeyId] = useState<string | null>(null);

	return {
		openKeyId,
		setOpenKeyId,
		getContextMenuProps: (keyId: string) => ({
			onOpenChange: (open: boolean) => setOpenKeyId(open ? keyId : null),
		}),
	};
};
