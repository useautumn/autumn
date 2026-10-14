import { StripeIcon } from "@/components/v2/icons/AutumnIcons";
import type { ReviewGroupSystem } from "../../utils/review/types/reviewGroup";

export function ReviewSystemMark({ system }: { system: ReviewGroupSystem }) {
	if (system === "stripe") {
		return <StripeIcon size={14} className="shrink-0 text-indigo-500" />;
	}
	return <span className="mx-0.5 size-2.5 shrink-0 rounded-[3px] bg-primary" />;
}
