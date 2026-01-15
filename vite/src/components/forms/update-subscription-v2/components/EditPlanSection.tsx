import { PencilSimpleIcon } from "@phosphor-icons/react";
import { Button } from "@/components/v2/buttons/Button";
import { SheetSection } from "@/components/v2/sheets/SharedSheetComponents";

interface EditPlanSectionProps {
	hasCustomizations: boolean;
	onEditPlan: () => void;
}

export function EditPlanSection({
	hasCustomizations,
	onEditPlan,
}: EditPlanSectionProps) {
	return (
		<SheetSection title="Plan Configuration" withSeparator>
			<div className="flex flex-col gap-2">
				{hasCustomizations && (
					<p className="text-xs text-amber-500">
						This subscription has custom pricing
					</p>
				)}
				<Button variant="secondary" onClick={onEditPlan} className="w-fit">
					<PencilSimpleIcon size={14} className="mr-1" />
					Edit Plan Items
				</Button>
			</div>
		</SheetSection>
	);
}
