import { useEffect, useState } from "react";

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
