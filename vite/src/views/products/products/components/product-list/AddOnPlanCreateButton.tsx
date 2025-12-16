import { useState } from "react";
import { Button } from "@/components/v2/buttons/Button";
import CreateProductSheet from "../CreateProductSheet";

export function AddOnPlanCreateButton() {
	const [open, setOpen] = useState(false);

	return (
		<>
			<CreateProductSheet open={open} onOpenChange={setOpen} isAddOn={true} />
			<Button variant="secondary" size="default" onClick={() => setOpen(true)}>
				Create Add-on Plan
			</Button>
		</>
	);
}

