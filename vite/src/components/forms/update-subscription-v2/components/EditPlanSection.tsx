import { InfoIcon, PencilSimpleIcon } from "@phosphor-icons/react";
import { Button } from "@/components/v2/buttons/Button";
import { SheetSection } from "@/components/v2/sheets/SharedSheetComponents";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/v2/tooltips/tooltip";

interface EditPlanSectionProps {
	hasCustomizations: boolean;
	onEditPlan: () => void;
}

function SectionTitle({ hasCustomizations }: { hasCustomizations: boolean }) {
	return (
		<span className="flex items-center gap-1.5">
			Plan Configuration
			{hasCustomizations && (
				<Tooltip>
					<TooltipTrigger asChild>
						<InfoIcon
							size={14}
							weight="fill"
							className="text-amber-500 cursor-help"
						/>
					</TooltipTrigger>
					<TooltipContent side="top">
						This subscription has custom pricing
					</TooltipContent>
				</Tooltip>
			)}
		</span>
	);
}

export function EditPlanSection({
	hasCustomizations,
	onEditPlan,
}: EditPlanSectionProps) {
	return (
		<SheetSection
			title={<SectionTitle hasCustomizations={hasCustomizations} />}
			withSeparator
		>
			<Button variant="secondary" onClick={onEditPlan} className="w-fit">
				<PencilSimpleIcon size={14} className="mr-1" />
				Edit Plan Items
			</Button>
		</SheetSection>
	);
}
