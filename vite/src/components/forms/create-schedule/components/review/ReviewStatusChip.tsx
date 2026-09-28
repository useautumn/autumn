import { StatusChip } from "@autumn/ui";
import type { ReviewChangeStatus } from "../../utils/review/types/reviewChange";
import { REVIEW_STATUS_CONFIG } from "./reviewStatusConfig";

export function ReviewStatusChip({ status }: { status: ReviewChangeStatus }) {
	const { label, tone, glyph } = REVIEW_STATUS_CONFIG[status];

	return (
		<StatusChip tone={tone} glyph={glyph}>
			{label}
		</StatusChip>
	);
}
