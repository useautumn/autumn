import { Button } from "@autumn/ui";
import { useState } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import { cn } from "@/lib/utils";
import CreateProductSheet from "../CreateProductSheet";

export function ProductListCreateButton({ className }: { className?: string }) {
	const [createPlanOpen, setCreatePlanOpen] = useState(false);

	useHotkeys(
		"n",
		(event) => {
			event.preventDefault();
			setCreatePlanOpen(true);
		},
		{ enableOnFormTags: false },
	);

	return (
		<>
			<CreateProductSheet
				open={createPlanOpen}
				onOpenChange={setCreatePlanOpen}
			/>
			<Button
				variant="primary"
				size="default"
				onClick={() => setCreatePlanOpen(true)}
				className={className ? cn(className) : undefined}
			>
				Create Plan
			</Button>
		</>
	);
}
