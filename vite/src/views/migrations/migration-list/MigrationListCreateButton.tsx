import { useState } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import { Button } from "@/components/v2/buttons/Button";
import { CreateMigrationDialog } from "../components/CreateMigrationDialog";

export function MigrationListCreateButton() {
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
			<CreateMigrationDialog open={open} onOpenChange={setOpen} />
			<Button variant="primary" size="default" onClick={() => setOpen(true)}>
				Create Migration
			</Button>
		</>
	);
}
