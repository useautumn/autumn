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
