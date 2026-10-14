import type { FixturePath } from "./schemaPaths";

type PathMap = Map<FixturePath, Set<string>>;

export type CoverageReport = {
	total: number;
	touched: number;
	percent: number;
	untouched: string[];
	unusedEnumValues: string[];
};

const inCollection = ({
	path,
	collection,
}: {
	path: FixturePath;
	collection: string;
}): boolean => path === collection || path.startsWith(`${collection}.`);

export const coverageReport = ({
	schema,
	document,
	collection,
}: {
	schema: PathMap;
	document: PathMap;
	collection: string;
}): CoverageReport => {
	const paths = [...schema.keys()]
		.filter((path) => inCollection({ path, collection }))
		.sort();

	const untouched = paths.filter((path) => !document.has(path));

	const unusedEnumValues: string[] = [];
	for (const path of paths) {
		const enumValues = schema.get(path);
		if (!enumValues || enumValues.size === 0) continue;
		const usedValues = document.get(path);
		for (const value of enumValues) {
			if (!usedValues?.has(value)) unusedEnumValues.push(`${path} = ${value}`);
		}
	}

	const total = paths.length;
	const touched = total - untouched.length;

	return {
		total,
		touched,
		percent: total === 0 ? 0 : Math.round((100 * touched) / total),
		untouched,
		unusedEnumValues,
	};
};

const MAX_LINES = 40;

const cappedSection = ({
	label,
	entries,
}: {
	label: string;
	entries: string[];
}): string[] => {
	if (entries.length === 0) return [];
	const shown = entries.slice(0, MAX_LINES);
	const remaining = entries.length - shown.length;
	return [
		`  ${label}:`,
		...shown.map((entry) => `    ${entry}`),
		...(remaining > 0 ? [`    +${remaining} more`] : []),
	];
};

export const formatCoverageReport = ({
	report,
	collection,
}: {
	report: CoverageReport;
	collection: string;
}): string =>
	[
		`${collection}: ${report.touched}/${report.total} paths touched (${report.percent}%)`,
		...cappedSection({ label: "untouched paths", entries: report.untouched }),
		...cappedSection({
			label: "unused enum values",
			entries: report.unusedEnumValues,
		}),
	].join("\n");
