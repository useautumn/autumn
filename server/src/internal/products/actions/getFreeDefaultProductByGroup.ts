import { isFreeProduct } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { PlanService } from "@/internal/products/PlanService";

export const getFreeDefaultProductByGroup = async ({
	ctx,
	productGroup,
}: {
	ctx: AutumnContext;
	productGroup: string;
}) => {
	const { db, org, env } = ctx;
	const defaultProducts = await PlanService.listDefault({
		db,
		orgId: org.id,
		group: productGroup,
		env,
	});

	return defaultProducts.find((p) => isFreeProduct({ prices: p.prices }));
};
