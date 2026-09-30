import { useEffect, useState } from "react";

/** Wall clock that re-renders every `intervalMs` while `active`. */
export const useNow = ({
	active = true,
	intervalMs = 1_000,
}: {
	active?: boolean;
	intervalMs?: number;
} = {}) => {
	const [now, setNow] = useState(() => Date.now());
	useEffect(() => {
		if (!active) return;
		const t = setInterval(() => setNow(Date.now()), intervalMs);
		return () => clearInterval(t);
	}, [active, intervalMs]);
	return now;
};
