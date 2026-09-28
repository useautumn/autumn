import { StatusConfigChip } from "@/components/forms/customer-state/components/StatusConfigChip";
import type { ReviewChangeStatus } from "../../utils/review/types/reviewChange";
import { REVIEW_STATUS_CONFIG } from "./reviewStatusConfig";

export function ReviewStatusChip({ status }: { status: ReviewChangeStatus }) {
	return <StatusConfigChip config={REVIEW_STATUS_CONFIG[status]} />;
}
