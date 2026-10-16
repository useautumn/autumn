import { Button } from "@autumn/ui";
import { useState } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import { APPROVAL_OPENERS } from "@/components/forms/shared/permission/approvalOpeners";
import { useCanDo } from "@/hooks/queries/useCanDo";
import { CreateMigrationDialog } from "../components/CreateMigrationDialog";

export function MigrationListCreateButton() {
	const canCreate = useCanDo(APPROVAL_OPENERS.createMigration);
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
			<CreateMigrationDialog open={open} onOpenChange={setOpen} />
			<Button variant="primary" size="default" onClick={() => setOpen(true)}>
				Create Migration
			</Button>
		</>
	);
}
