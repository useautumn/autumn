import { useState } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import { Button } from "@/components/v2/buttons/Button";
import CreateFeatureSheet from "../components/CreateFeatureSheet";

export function FeatureListCreateButton() {
	const [open, setOpen] = useState(false);

	useHotkeys(
		"n",
		(event) => {
			event.preventDefault();
			setOpen(true);
		},
		{ enableOnFormTags: false },
	);

	return (
		<>
			<CreateFeatureSheet open={open} onOpenChange={setOpen} />
			<Button variant="primary" size="default" onClick={() => setOpen(true)}>
				Create Feature
			</Button>
		</>
	);
}


