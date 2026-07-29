import pLimit from "p-limit";
import type { BatchResetGroup, ResetMutation } from "../../types.js";
import { computeResetMutation } from "./computeResetMutation.js";

const RESET_MUTATION_CONCURRENCY = 25;

export const computeResetMutations = async ({
	resetGroups,
}: {
	resetGroups: BatchResetGroup[];
}): Promise<ResetMutation[]> => {
	const limit = pLimit(RESET_MUTATION_CONCURRENCY);
	const mutations = await Promise.all(
		resetGroups.flatMap((group) =>
			group.customerEntitlements.map((customerEntitlement) =>
				limit(() =>
					computeResetMutation({
						ctx: group.ctx,
						customerEntitlement,
					}),
				),
			),
		),
	);

	return mutations.filter(
		(mutation): mutation is ResetMutation => mutation !== null,
	);
};
