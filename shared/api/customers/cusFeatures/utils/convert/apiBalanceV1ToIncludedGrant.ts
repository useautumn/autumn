import { sumValues } from "@utils/utils";
import type { ApiBalanceV1 } from "../../apiBalanceV1";

export const apiBalanceV1ToIncludedGrant = ({
	apiBalance,
}: {
	apiBalance: ApiBalanceV1;
}): number =>
	sumValues((apiBalance.breakdown ?? []).map((item) => item.included_grant));
