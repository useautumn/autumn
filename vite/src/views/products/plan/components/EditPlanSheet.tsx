import { useId } from "react";
import { Input } from "@/components/v2/inputs/input";
import { SheetHeader, SheetSection } from "@/components/v2/sheets/InlineSheet";

export function EditPlanSheet() {
	const nameId = useId();
	const idId = useId();
	const descriptionId = useId();

	return (
		<div className="min-w-md bg-card z-50 border-l shadow-sm flex flex-col">
			<SheetHeader
				title="New Plan"
				description="Configure how this feature is used in your app"
			/>

			<SheetSection title="Plan Details">
				<div className="space-y-4">
					<div className="grid grid-cols-2 gap-4">
						<div>
							<label htmlFor={nameId} className="text-form-label mb-2 block">
								Name
							</label>
							<Input id={nameId} placeholder="e.g. Pro Plan" />
						</div>
						<div>
							<label htmlFor={idId} className="text-form-label mb-2 block">
								ID
							</label>
							<Input id={idId} placeholder="fills automatically" disabled />
						</div>
					</div>
					{/* <div>
						<label
							htmlFor={descriptionId}
							className="text-sm font-medium text-foreground mb-2 block"
						>
							Description
						</label>
						<Input id={descriptionId} placeholder="e.g. Pro Plan" />
					</div> */}
				</div>
			</SheetSection>
		</div>
	);
}
