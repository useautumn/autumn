import {
	CusProductStatus,
	type Entity,
	type FullCusProduct,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService.js";

export const cancelSubsForEntity = async ({
	ctx,
	cusProducts,
	entity,
}: {
	ctx: AutumnContext;
	cusProducts: FullCusProduct[];
	entity: Entity;
}) => {
	const { logger } = ctx;
	try {
		for (const cusProduct of cusProducts) {
			if (cusProduct.internal_entity_id !== entity.internal_id) {
				continue;
			}

			if (cusProduct.status === CusProductStatus.Scheduled) {
				await CusProductService.delete({
					ctx,
					cusProductId: cusProduct.id,
				});
			}
		}
	} catch (error) {
		logger.error("Failed to cancel subs for deleted entity", { error });
	}
};
