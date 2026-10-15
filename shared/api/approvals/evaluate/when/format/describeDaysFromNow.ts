import { pluralizeUnit } from "./pluralizeUnit";

/** 30 → "30 days from now", -7 → "7 days ago", 0 → "now". */
export const describeDaysFromNow = ({ days }: { days: number }) => {
	if (days === 0) return "now";
	const span = pluralizeUnit({ count: Math.abs(days), unit: "day" });
	return days > 0 ? `${span} from now` : `${span} ago`;
};
