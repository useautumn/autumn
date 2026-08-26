import { IconButton } from "@autumn/ui";
import { ArrowUpFromLine } from "lucide-react";
import { usePromotePlanVersion } from "../hooks/usePromotePlanVersion";
import PlanChangeDialog from "../versioning/PlanChangeDialog";

export const PromoteToActiveButton = () => {
	const promote = usePromotePlanVersion();

	if (!promote.canPromote) return null;

	return (
		<>
			<IconButton
				onClick={promote.startPromote}
				aria-label="Promote to active"
				variant="secondary"
				iconOrientation="left"
				icon={<ArrowUpFromLine />}
				size="mini"
				disabled={promote.isPreviewing}
			>
				Promote to active
			</IconButton>
			{promote.confirm && (
				<PlanChangeDialog
					createConfirm={promote.confirm}
					open
					setOpen={(nextOpen) => {
						if (!nextOpen) promote.setConfirm(null);
					}}
				/>
			)}
		</>
	);
};
