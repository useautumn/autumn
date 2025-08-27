import { ExtendedRequest } from "@/utils/models/Request.js";
import { Response } from "express";
import { routeHandler } from "@/utils/routerUtils.js";
import { CusBatchService } from "../CusBatchService.js";
import RecaseError from "@/utils/errorUtils.js";
import {
	AppEnv,
	CusProductStatus,
	ErrCode,
	Organization,
} from "@autumn/shared";
import { DrizzleCli } from "@/db/initDrizzle.js";
import z from "zod";

const schema = z.object({
	page: z.number().int().min(1, { message: "Page must be greater than 0" }),
	pageSize: z
		.number()
		.min(10)
		.max(100)
		.refine((val) => 10 <= val && val <= 100, {
			message: "Page size must be between 10 and 1000",
		}),
	statuses: z
		.array(z.nativeEnum(CusProductStatus))
		.optional()
		.refine(
			(statuses) =>
				!statuses ||
				statuses.every((status) =>
					Object.values(CusProductStatus).includes(status)
				),
			{
				message: "Invalid statuses",
			}
		),
});

export const handleBatchCustomers = async (req: any, res: any) =>
	routeHandler({
		req,
		res,
		action: "batch get customers",
		validator: schema,
		loader: async (
			org: Organization,
			env: AppEnv,
			db: DrizzleCli,
			body: z.infer<typeof schema>,
			_: any,
			req: ExtendedRequest
		) => {
			return await CusBatchService.getPage({
				db,
				ch: req.clickhouseClient,
				org,
				env,
				page: body.page as number,
				pageSize: body.pageSize,
				features: req.features,
				statuses: body.statuses ?? [],
				logger: req.logtail,
				reqApiVersion: req.apiVersion,
			});
		},
		handler: async (_, res: Response, data) => {
			if (data) {
				res.status(200).json({
					list: data,
					total: data.length,
				});
			} else {
				throw new RecaseError({
					message: "No customers found",
					code: ErrCode.CustomersNotFound,
				});
			}
		},
		withSpan: true,
	});