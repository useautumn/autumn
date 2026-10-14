export type ProducedOffsets = {
	remember(range: { from: bigint; to: bigint }): void;
	has(position: { offset: bigint }): boolean;
	size(): number;
};

export function createProducedOffsets(): ProducedOffsets {
	const ranges: { from: bigint; to: bigint }[] = [];

	function remember({ from, to }: { from: bigint; to: bigint }): void {
		if (to < from) throw new RangeError("Produced range ends before it starts");
		const last = ranges[ranges.length - 1];
		if (last && from === last.to + 1n) {
			last.to = to;
			return;
		}
		ranges.push({ from, to });
	}

	function has({ offset }: { offset: bigint }): boolean {
		while (ranges.length > 0 && (ranges[0]?.to ?? 0n) < offset) ranges.shift();
		const first = ranges[0];
		return first !== undefined && first.from <= offset && offset <= first.to;
	}

	function size(): number {
		return ranges.length;
	}

	return { remember, has, size };
}
