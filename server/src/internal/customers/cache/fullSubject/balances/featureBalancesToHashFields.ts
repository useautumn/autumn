import type { SubjectBalance } from "@autumn/shared";

type BalanceHashMeta = {
	featureId: string;
	customerEntitlementIds: string[];
};

export const featureBalancesToHashFields = ({
	featureId,
	balances,
}: {
	featureId: string;
	balances: SubjectBalance[];
}): Record<string, string> => {
	const meta: BalanceHashMeta = {
		featureId,
		customerEntitlementIds: balances.map((balance) => balance.id),
	};

	const hashFields: Record<string, string> = {
		_meta: JSON.stringify(meta),
	};

	for (const balance of balances) {
		hashFields[balance.id] = JSON.stringify(balance);
	}

	return hashFields;
};
