import { createStripeCli } from "@/external/stripe/utils.js";
import { cancelCurSubs } from "@/internal/customers/change-product/handleDowngrade/cancelCurSubs.js";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService.js";
import { cusProductsToStripeSubs } from "@/internal/customers/cusProducts/cusProductUtils/convertCusProduct.js";
import { ExtendedRequest } from "@/utils/models/Request.js";
import { CusProductStatus, Entity, FullCusProduct } from "@autumn/shared";

export const cancelSubsForEntity = async ({
	req,
	cusProducts,
	entity,
}: {
	req: ExtendedRequest;
	cusProducts: FullCusProduct[];
	entity: Entity;
}) => {
	const { org, env, db, logtail: logger } = req;
	try {
		let stripeCli = createStripeCli({ org, env });
		let curSubs = await cusProductsToStripeSubs({
			cusProducts,
			stripeCli,
		});

		for (const cusProduct of cusProducts) {
			if (cusProduct.internal_entity_id !== entity.internal_id) {
				continue;
			}

			if (cusProduct.status == CusProductStatus.Scheduled) {
				await CusProductService.delete({
					db,
					cusProductId: cusProduct.id,
				});
			} else {
				await cancelCurSubs({
					curCusProduct: cusProduct,
					curSubs,
					stripeCli,
				});
			}
		}
	} catch (error) {
		logger.error("Failed to cancel subs for deleted entity", { error });
	}
};
