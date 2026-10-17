/** `2, "month"` → "2 months". */
export const pluralizeUnit = ({
	count,
	unit,
}: {
	count: number;
	unit: string;
}) => `${count} ${unit}${count === 1 ? "" : "s"}`;
