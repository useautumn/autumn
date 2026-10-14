import type {
	SubjectCatalog,
	SubjectQueryEnvelope,
	SubjectQueryRow,
} from "@autumn/shared";

const EMPTY_CATALOG: SubjectCatalog = {
	products: [],
	entitlements: [],
	prices: [],
	free_trials: [],
};

export const unpackSubjectEnvelope = ({
	rows,
}: {
	rows: unknown[];
}): SubjectQueryRow[] => {
	const envelope = (rows[0] as { result?: SubjectQueryEnvelope } | undefined)
		?.result;
	if (!envelope?.subjects?.length) return [];

	const catalog: SubjectCatalog = {
		products: envelope.products ?? EMPTY_CATALOG.products,
		entitlements: envelope.entitlements ?? EMPTY_CATALOG.entitlements,
		prices: envelope.prices ?? EMPTY_CATALOG.prices,
		free_trials: envelope.free_trials ?? EMPTY_CATALOG.free_trials,
	};

	return envelope.subjects.map((subject) => ({ ...subject, ...catalog }));
};
