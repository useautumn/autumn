import { useEffect, useState } from "react";

/** The current time, re-read on an interval while `active`; the one effect a countdown needs. */
export const useNow = ({
	active,
	intervalMs = 1_000,
}: {
	active: boolean;
	intervalMs?: number;
}) => {
	const [now, setNow] = useState(() => Date.now());

	useEffect(() => {
		if (!active) return;
		setNow(Date.now());
		const timer = setInterval(() => setNow(Date.now()), intervalMs);
		return () => clearInterval(timer);
	}, [active, intervalMs]);

	return now;
};
