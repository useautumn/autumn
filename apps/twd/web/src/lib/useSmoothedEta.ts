import { useEffect, useRef, useState } from "react";
import { smoothFinishAt } from "../../../src/internal/runs/eta/smoothEta.ts";

type Finish = { p50: number; p90: number };

/** Counts down between server updates and eases toward each new estimate. */
export const useSmoothedEta = ({
	etaMs,
	etaP90Ms,
	now,
}: {
	etaMs: number | null;
	etaP90Ms: number | null;
	now: number;
}) => {
	const [finish, setFinish] = useState<Finish | null>(null);
	const shown = useRef<Finish | null>(null);
	useEffect(() => {
		if (etaMs == null || etaP90Ms == null) {
			shown.current = null;
			setFinish(null);
			return;
		}
		const at = Date.now();
		const p50 = smoothFinishAt({
			shownFinishAt: shown.current?.p50 ?? null,
			etaMs,
			now: at,
		});
		const p90 = smoothFinishAt({
			shownFinishAt: shown.current?.p90 ?? null,
			etaMs: etaP90Ms,
			now: at,
		});
		shown.current = { p50, p90: Math.max(p50, p90) };
		setFinish(shown.current);
	}, [etaMs, etaP90Ms]);
	if (!finish) return null;
	return {
		etaMs: Math.max(0, finish.p50 - now),
		etaP90Ms: Math.max(0, finish.p90 - now),
	};
};
