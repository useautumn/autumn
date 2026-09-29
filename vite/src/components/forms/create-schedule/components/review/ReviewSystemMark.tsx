import { StripeIcon } from "@/components/v2/icons/AutumnIcons";
import type { ReviewChangeSystem } from "../../utils/review/types/reviewChange";

export function ReviewSystemMark({ system }: { system: ReviewChangeSystem }) {
	if (system === "stripe") {
		return <StripeIcon size={14} className="shrink-0 text-indigo-500" />;
	}
	return <span className="mx-0.5 size-2.5 shrink-0 rounded-[3px] bg-primary" />;
}
