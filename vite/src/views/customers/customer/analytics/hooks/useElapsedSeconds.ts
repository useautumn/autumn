import { useEffect, useState } from "react";

/** Whole seconds since `active` last turned true; 0 while inactive. */
export const useElapsedSeconds = ({ active }: { active: boolean }) => {
	const [seconds, setSeconds] = useState(0);

	useEffect(() => {
		setSeconds(0);
		if (!active) return;
		const startedAt = Date.now();
		const timer = setInterval(
			() => setSeconds(Math.floor((Date.now() - startedAt) / 1000)),
			1000,
		);
		return () => clearInterval(timer);
	}, [active]);

	return seconds;
};
