import { StatusChip } from "@autumn/ui";
import type { ReviewChangeStatus } from "../../utils/review/types/reviewChange";
import { REVIEW_STATUS_CONFIG } from "./reviewStatusConfig";

export function ReviewStatusChip({ status }: { status: ReviewChangeStatus }) {
	const { icon: Icon, label, iconClassName } = REVIEW_STATUS_CONFIG[status];

	return (
		<StatusChip icon={<Icon strokeWidth={3} />} iconClassName={iconClassName}>
			{label}
		</StatusChip>
	);
}
