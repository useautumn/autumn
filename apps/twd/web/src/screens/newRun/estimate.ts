/** Fan-out overhead before the first file starts (DESIGN.md budget). */
const FANOUT_MS = 2 * 60_000;
const UNSEEN_MS = 60_000;

/** Longest-first makespan of baseline p90s over `workers` sandboxes. */
export const estimateWallMs = ({
	p90s,
	workers,
}: {
	p90s: (number | null)[];
	workers: number;
}) => {
	if (!p90s.length || workers < 1) return null;
	const durations = p90s.map((d) => d ?? UNSEEN_MS).sort((a, b) => b - a);
	if (workers >= durations.length) return FANOUT_MS + durations[0];
	const heap = new Array<number>(workers).fill(0);
	const siftDown = () => {
		let i = 0;
		for (;;) {
			const l = 2 * i + 1;
			const r = l + 1;
			let m = i;
			if (l < workers && heap[l] < heap[m]) m = l;
			if (r < workers && heap[r] < heap[m]) m = r;
			if (m === i) return;
			[heap[i], heap[m]] = [heap[m], heap[i]];
			i = m;
		}
	};
	for (const d of durations) {
		heap[0] += d;
		siftDown();
	}
	return FANOUT_MS + Math.max(...heap);
};

const BOOT_S = 90;

/** Worker-seconds a run bills: every file's p90 plus one boot per worker. */
export const estimateWorkerSeconds = ({
	p90s,
	workers,
}: {
	p90s: (number | null)[];
	workers: number;
}) =>
	p90s.reduce<number>((sum, d) => sum + (d ?? UNSEEN_MS) / 1000, 0) +
	BOOT_S * workers;

/** Subsequence fuzzy match; returns matched indexes or null. Word-boundary hits score higher. */
export const fuzzyMatch = (query: string, target: string) => {
	const q = query.toLowerCase().replace(/\s+/g, "");
	if (!q) return { score: 0, indexes: [] as number[] };
	const t = target.toLowerCase();
	const indexes: number[] = [];
	let score = 0;
	let ti = 0;
	for (const ch of q) {
		const found = t.indexOf(ch, ti);
		if (found === -1) return null;
		const boundary = found === 0 || "/-_.".includes(t[found - 1]);
		const adjacent =
			indexes.length > 0 && indexes[indexes.length - 1] === found - 1;
		score +=
			(boundary ? 6 : 0) + (adjacent ? 4 : 0) - Math.min(found - ti, 8) * 0.3;
		indexes.push(found);
		ti = found + 1;
	}
	const contiguous = t.indexOf(q);
	if (contiguous !== -1)
		return {
			score: score + 30 - contiguous * 0.02 - t.length * 0.01,
			indexes: Array.from({ length: q.length }, (_, i) => contiguous + i),
		};
	return { score: score - t.length * 0.01, indexes };
};
