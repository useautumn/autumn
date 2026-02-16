import { useEffect, useState } from "react";

export const useDialog = (component?: any) => {
	const [dialogProps, setDialogProps] = useState<any>(null);
	const [dialogOpen, setDialogOpen] = useState<boolean>(false);

	useEffect(() => {
		if (!dialogOpen) {
			setTimeout(() => {
				setDialogProps(null);
			}, 200);
		}
	}, [dialogOpen]);

	return [dialogProps, setDialogProps, dialogOpen, setDialogOpen];
};
