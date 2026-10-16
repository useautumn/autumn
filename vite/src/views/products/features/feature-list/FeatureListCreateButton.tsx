import { Button } from "@autumn/ui";
import { useState } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import { APPROVAL_OPENERS } from "@/components/forms/shared/permission/approvalOpeners";
import { useCanDo } from "@/hooks/queries/useCanDo";
import CreateFeatureSheet from "../components/CreateFeatureSheet";

export function FeatureListCreateButton() {
	const canCreate = useCanDo(APPROVAL_OPENERS.editFeatures);
	const [open, setOpen] = useState(false);

	useHotkeys(
		"n",
		(event) => {
			event.preventDefault();
			setOpen(true);
		},
		{ enableOnFormTags: false },
	);

	if (!canCreate) return null;

	return (
		<>
			<CreateFeatureSheet open={open} onOpenChange={setOpen} />
			<Button variant="primary" size="default" onClick={() => setOpen(true)}>
				Create Feature
			</Button>
		</>
	);
}
