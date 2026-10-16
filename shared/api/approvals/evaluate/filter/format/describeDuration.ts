import { pluralizeUnit } from "./pluralizeUnit";

/** `{ length: 45, unit: "day" }` → "45 days". */
export const describeDuration = ({
	duration,
}: {
	duration: { length: number; unit: string };
}) => pluralizeUnit({ count: duration.length, unit: duration.unit });
