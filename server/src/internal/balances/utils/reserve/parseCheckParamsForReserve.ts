import { generateKsuid } from "@autumn/ksuid";
import type { CheckParams, ReserveParams } from "@autumn/shared";

export const parseCheckParamsForReserve = ({
	params,
}: {
	params: CheckParams;
}) => {
	const { reserve } = params;
	if (!reserve?.enabled) {
		return {
			...params,
			reserve: undefined,
		};
	}

	const finalReserve: ReserveParams = {
		enabled: true,
		key: reserve.key
			? Bun.hash(reserve.key).toString()
			: generateKsuid({ prefix: "res" }),
		expires_at: reserve.expires_at ?? undefined,
	};

	return {
		...params,
		reserve: finalReserve,
	};
};
