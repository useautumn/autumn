import type { ApiBalanceV1 } from "@autumn/shared";

export const sharedIntervalBalanceTotals = ({
	balance,
	interval,
}: {
	balance: ApiBalanceV1;
	interval: string | undefined;
}) => {
	const sharedRows = (balance.breakdown ?? []).filter(
		(row) => row.source !== "entity" && row.reset?.interval === interval,
	);
	return {
		granted: sharedRows.reduce(
			(total, row) => total + row.included_grant + row.prepaid_grant,
			0,
		),
		remaining: sharedRows.reduce((total, row) => total + row.remaining, 0),
	};
};
