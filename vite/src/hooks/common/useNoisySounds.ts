import { useEffect } from "react";

/** Loads cuelume only while enabled, so nobody else downloads or runs it. */
export function useNoisySounds({ enabled }: { enabled: boolean }) {
	useEffect(() => {
		if (!enabled) return;
		let stop: (() => void) | undefined;
		let cancelled = false;
		void import("@/lib/noisy/noisySounds").then(({ startNoisySounds }) => {
			if (!cancelled) stop = startNoisySounds();
		});
		return () => {
			cancelled = true;
			stop?.();
		};
	}, [enabled]);
}
