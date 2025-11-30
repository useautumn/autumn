import { useState } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import { Button } from "@/components/v2/buttons/Button";
import CreateProductSheet from "../CreateProductSheet";

export function ProductListCreateButton({ className }: { className?: string }) {
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
			<CreateProductSheet open={open} onOpenChange={setOpen} />
			<Button
				variant="primary"
				size="default"
				onClick={() => setOpen(true)}
				className={className}
			>
				Create Plan
			</Button>
		</>
	);
}
