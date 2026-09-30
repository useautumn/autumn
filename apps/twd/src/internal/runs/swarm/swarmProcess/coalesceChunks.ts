/** The runner re-parses a file's whole output on every chunk; batching chunks keeps that linear-ish at swarm width. */
export const coalesceChunks = ({
	onChunk,
	intervalMs,
}: {
	onChunk: (text: string) => void;
	intervalMs: number;
}) => {
	let pending = "";
	let timer: ReturnType<typeof setTimeout> | undefined;
	const flush = () => {
		if (timer) clearTimeout(timer);
		timer = undefined;
		if (!pending) return;
		const text = pending;
		pending = "";
		onChunk(text);
	};
	return {
		push: (text: string) => {
			pending += text;
			timer ??= setTimeout(flush, intervalMs);
		},
		flush,
	};
};
