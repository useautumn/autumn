import type { SetPlansReviewText } from "@autumn/shared";
import { formatPhaseDate } from "../schedulePhaseTiming";

/** Review text from the preview, with its dates in the viewer's timezone. */
export const formatReviewText = (text: SetPlansReviewText) =>
	text
		.map((part) =>
			typeof part === "string"
				? part
				: formatPhaseDate({ startsAt: part.date }),
		)
		.join("");
