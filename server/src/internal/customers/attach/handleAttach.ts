import { AttachBodyV0Schema } from "@autumn/shared";
import { handleAttachRaceCondition } from "@/external/redis/redisUtils.js";
import type {
	ExtendedRequest,
	ExtendedResponse,
} from "@/utils/models/Request.js";
import { routeHandler } from "@/utils/routerUtils.js";
import type { AutumnContext } from "../../../honoUtils/HonoEnv.js";
import { checkStripeConnections } from "./attachRouter.js";
import { getAttachParams } from "./attachUtils/attachParams/getAttachParams.js";
import { getAttachBranch } from "./attachUtils/getAttachBranch.js";
import { getAttachConfig } from "./attachUtils/getAttachConfig.js";
import { runAttachFunction } from "./attachUtils/getAttachFunction.js";
import { handleAttachErrors } from "./attachUtils/handleAttachErrors.js";
import { insertCustomItems } from "./attachUtils/insertCustomItems.js";

export const handleAttach = async (req: any, res: any) =>
	routeHandler({
		req,
		res,
		action: "attach",
		handler: async (req: ExtendedRequest, res: ExtendedResponse) => {
			await handleAttachRaceCondition({ req, res });

			const attachBody = AttachBodyV0Schema.parse(req.body);

			const ctx = req as AutumnContext;

			const { attachParams, customPrices, customEnts } = await getAttachParams({
				ctx,
				attachBody,
			});

			// console.log("Options list: ", attachParams.optionsList);
			// throw new Error(
			// 	"Options list: " + JSON.stringify(attachParams.optionsList),
			// );

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
			} catch (_error) {}

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
