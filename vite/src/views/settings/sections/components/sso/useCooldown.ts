import { useEffect, useState } from "react";

/** Simple 1s-tick countdown used for verification retry cooldowns. */
export const useCooldown = () => {
	const [secondsLeft, setSecondsLeft] = useState(0);

	useEffect(() => {
		if (secondsLeft <= 0) return;
		const timer = setTimeout(() => setSecondsLeft((prev) => prev - 1), 1000);
		return () => clearTimeout(timer);
	}, [secondsLeft]);

	return { secondsLeft, startCooldown: setSecondsLeft };
};
