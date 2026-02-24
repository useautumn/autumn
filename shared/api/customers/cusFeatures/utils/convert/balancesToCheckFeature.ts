import type { ApiBalanceInput } from "@api/customers/cusFeatures/utils/convert/apiBalanceToAllowed";

export const balancesToCheckFeature = ({
	balances,
}: {
	balances: Record<string, ApiBalanceInput>;
}) => {
	return balances.map((balance) => {
		return {
			featureId: balance.featureId,
		};
	});
};
