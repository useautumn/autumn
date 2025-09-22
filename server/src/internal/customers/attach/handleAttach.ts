import { handleAttachRaceCondition } from "@/external/redis/redisUtils.js";
import { ExtendedRequest, ExtendedResponse } from "@/utils/models/Request.js";
import { routeHandler } from "@/utils/routerUtils.js";
import { AttachBodySchema } from "@autumn/shared";
import { getAttachParams } from "./attachUtils/attachParams/getAttachParams.js";
import { getAttachBranch } from "./attachUtils/getAttachBranch.js";
import { getAttachConfig } from "./attachUtils/getAttachConfig.js";
import { handleAttachErrors } from "./attachUtils/handleAttachErrors.js";
import { checkStripeConnections } from "./attachRouter.js";
import { insertCustomItems } from "./attachUtils/insertCustomItems.js";
import { runAttachFunction } from "./attachUtils/getAttachFunction.js";

export const handleAttach = async (req: any, res: any) =>
	routeHandler({
		req,
		res,
		action: "attach",
		handler: async (req: ExtendedRequest, res: ExtendedResponse) => {
			await handleAttachRaceCondition({ req, res });

			const attachBody = AttachBodySchema.parse(req.body);

			const { attachParams, customPrices, customEnts } = await getAttachParams({
				req,
				attachBody,
			});

			// Handle existing product
			const branch = await getAttachBranch({
				req,
				attachBody,
				attachParams,
			});

			const { flags, config } = await getAttachConfig({
				req,
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
				req,
				attachParams,
				useCheckout: config.onlyCheckout,
			});

			await insertCustomItems({
				db: req.db,
				customPrices: customPrices || [],
				customEnts: customEnts || [],
			});

			try {
				req.logger.info(`Attach params: `, {
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
			} catch (error) {}

			await runAttachFunction({
				req,
				res,
				attachParams,
				branch,
				attachBody,
				config,
			});
		},
	});
