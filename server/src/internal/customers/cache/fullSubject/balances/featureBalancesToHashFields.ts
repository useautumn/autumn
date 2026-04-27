import type { SubjectBalance } from "@autumn/shared";

export const featureBalancesToHashFields = ({
	featureId: _featureId,
	balances,
}: {
	featureId?: string;
	balances: SubjectBalance[];
}): Record<string, string> => {
	const hashFields: Record<string, string> = {};

	for (const balance of balances) {
		hashFields[balance.id] = JSON.stringify(balance);
	}

	return hashFields;
};
