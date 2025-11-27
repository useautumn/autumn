import { AttachBodyV0Schema } from "../../../../../shared/api/billing/attach/prevVersions/attachBodyV0";
import { AffectedResource } from "../../../../../shared/api/versionUtils/versionUtils";
import { createRoute } from "../../../honoMiddlewares/routeHandler";
import { checkStripeConnections } from "../../customers/attach/attachRouter";
import { getAttachParams } from "../../customers/attach/attachUtils/attachParams/getAttachParams";
import { getAttachBranch } from "../../customers/attach/attachUtils/getAttachBranch";
import { getAttachConfig } from "../../customers/attach/attachUtils/getAttachConfig";
import { handleAttachErrors } from "../../customers/attach/attachUtils/handleAttachErrors";
import { insertCustomItems } from "../../customers/attach/attachUtils/insertCustomItems";

export const handleAttachV2 = createRoute({
	body: AttachBodyV0Schema,
	resource: AffectedResource.Attach,
	handler: async (c) => {
		// await handleAttachRaceCondition({ req, res });
		const ctx = c.get("ctx");
		const attachBody = c.req.valid("json");

		const { attachParams, customPrices, customEnts } = await getAttachParams({
			ctx,
			attachBody,
		});

		// Handle existing product
		const branch = await getAttachBranch({
			ctx,
			attachBody,
			attachParams,
		});

		const { flags, config } = await getAttachConfig({
			ctx,
			attachParams,
			attachBody,
			branch,
		});

		await handleAttachErrors({
			attachParams,
			attachBody,
			branch,
			flags,
			config,
		});

		await checkStripeConnections({
			ctx,
			attachParams,
			useCheckout: config.onlyCheckout,
		});

		await insertCustomItems({
			db: ctx.db,
			customPrices: customPrices || [],
			customEnts: customEnts || [],
		});

		try {
			ctx.logger.info(`Attach params: `, {
				data: {
					products: attachParams.products.map((p) => ({
						id: p.id,
						name: p.name,
						processor: p.processor,
						version: p.version,
					})),
					prices: attachParams.prices.map((p) => ({
						id: p.id,
						config: p.config,
					})),
					entitlements: attachParams.entitlements.map((e) => ({
						internal_feature_id: e.internal_feature_id,
						feature_id: e.feature_id,
					})),
					freeTrial: attachParams.freeTrial,
				},
			});
		} catch (_error) {}

		// const response = await runAttachFunction({
		//   req,
		//   res,
		//   attachParams,
		//   branch,
		//   attachBody,
		//   config,
		// });

		return c.json({
			message: "Hello, world!",
		});
	},
});
