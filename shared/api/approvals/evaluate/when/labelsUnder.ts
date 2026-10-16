/** The labels below `prefix`, keyed by the rest of their path ("incoming.paid" → "paid"). */
export const labelsUnder = ({
	labels,
	prefix,
}: {
	labels: Record<string, string>;
	prefix: string;
}): Record<string, string> =>
	Object.fromEntries(
		Object.entries(labels)
			.filter(([path]) => path.startsWith(`${prefix}.`))
			.map(([path, label]) => [path.slice(prefix.length + 1), label]),
	);
