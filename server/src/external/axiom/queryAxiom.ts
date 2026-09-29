import { getAxiomClient } from "./initAxiom.js";

export const queryAxiom = async ({
	apl,
	options,
}: {
	apl: string;
	options?: {
		startTime?: string;
		endTime?: string;
	};
}) => getAxiomClient().query(apl, options);

export const queryAxiomTabular = async ({
	apl,
	options,
}: {
	apl: string;
	options?: { startTime?: string; endTime?: string };
}): Promise<Record<string, unknown>[]> => {
	const result = await getAxiomClient().query(apl, {
		...options,
		format: "tabular",
	});
	return result.tables.flatMap((table) => [...table.events()]);
};
