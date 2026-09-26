import { useEffect, useState } from "react";
import { clampMaxGroups } from "../../hooks/useAnalyticsFilterState";

export const MaxGroupsInput = ({
	value,
	onChange,
}: {
	value: number;
	onChange: (value: number) => void;
}) => {
	const [draft, setDraft] = useState(String(value));

	useEffect(() => setDraft(String(value)), [value]);

	const commit = () => {
		const parsed = Number.parseInt(draft, 10);
		if (Number.isNaN(parsed)) {
			setDraft(String(value));
			return;
		}
		const clamped = clampMaxGroups(parsed);
		setDraft(String(clamped));
		if (clamped !== value) onChange(clamped);
	};

	return (
		<input
			type="number"
			min={1}
			max={250}
			value={draft}
			onChange={(e) => setDraft(e.target.value)}
			onBlur={commit}
			onKeyDown={(e) => {
				if (e.key === "Enter") commit();
				if (e.key === "Escape") setDraft(String(value));
			}}
			className="w-16 h-7 px-2 rounded-md border bg-background text-xs text-right tabular-nums outline-none focus:border-primary"
		/>
	);
};
