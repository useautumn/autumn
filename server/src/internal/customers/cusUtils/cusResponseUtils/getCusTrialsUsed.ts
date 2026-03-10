import { CustomerExpand, type FullCustomer } from "@autumn/shared";
import type { RepoContext } from "@/db/repoContext.js";
import { customerProductRepo } from "../../cusProducts/repos/index.js";

export const getCusTrialsUsed = async ({
	ctx,
	fullCus,
	expand,
}: {
	ctx: RepoContext;
	fullCus: FullCustomer;
	expand?: CustomerExpand[];
}) => {
	if (!expand?.includes(CustomerExpand.TrialsUsed)) {
		return undefined;
	}

	return customerProductRepo.fetchFreeTrials({ ctx, fullCus });
};
