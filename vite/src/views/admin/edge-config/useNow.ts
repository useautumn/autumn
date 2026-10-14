import { useEffect, useState } from "react";

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
