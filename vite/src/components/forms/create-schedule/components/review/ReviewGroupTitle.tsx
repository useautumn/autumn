import type { ReviewChangeSystem } from "../../utils/review/types/reviewChange";
import { ReviewSystemMark } from "./ReviewSystemMark";

export function ReviewGroupTitle({
	system,
	title,
}: {
	system: ReviewChangeSystem;
	title: string;
}) {
	return (
		<>
			<ReviewSystemMark system={system} />
			<span className="text-sm font-medium text-foreground">{title}</span>
		</>
	);
}
