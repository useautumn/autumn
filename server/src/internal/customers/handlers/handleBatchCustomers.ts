import { ExtendedRequest } from "@/utils/models/Request.js";
import { Response } from "express";
import { routeHandler } from "@/utils/routerUtils.js";
import { CusBatchService } from "../CusBatchService.js";
import RecaseError from "@/utils/errorUtils.js";
import { AppEnv, ErrCode, Organization } from "@autumn/shared";
import { DrizzleCli } from "@/db/initDrizzle.js";

export const handleBatchCustomers = async (req: any, res: any) =>
	routeHandler({
		req,
		res,
		action: "batch get customers",
		validator: async (req: ExtendedRequest, res: Response) => {
			const { page, pageSize } = req.body;
			if (page && page < 1) {
				throw new RecaseError({
					message: "Page must be greater than 0",
					code: ErrCode.InvalidRequest,
				});
			}

			if (![10, 50, 100, 500].includes(pageSize)) {
				throw new RecaseError({
					message: "Page size must be one of: 10, 50, 100, or 500",
					code: ErrCode.InvalidRequest,
				});
			}
		},
		loader: async (
			org: Organization,
			env: AppEnv,
			db: DrizzleCli,
			req: ExtendedRequest
		) => {
			const customers = await CusBatchService.getPage({
				db,
				org,
				env,
				page: req.body.page as number,
				pageSize: req.body.pageSize as 10 | 50 | 100 | 500,
			});

			return {
				customers,
			};
		},
		handler: async (_, res: Response, load) => {
			if (load.customers) {
				res.status(200).json(load);
			} else {
				throw new RecaseError({
					message: "No customers found",
					code: ErrCode.CustomersNotFound,
				});
			}
		},
	});