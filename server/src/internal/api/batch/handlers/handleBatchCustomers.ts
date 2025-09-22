import { ExtendedRequest } from "@/utils/models/Request.js";
import { Response } from "express";
import { routeHandler } from "@/utils/routerUtils.js";
import { CusBatchService } from "../CusBatchService.js";
import RecaseError from "@/utils/errorUtils.js";
import { CusProductStatus, ErrCode } from "@autumn/shared";
import z from "zod";

const schema = z.object({
	limit: z
		.number({
			required_error: "limit is required",
			invalid_type_error: "limit must be a number",
		})
		.int({ message: "limit must be an integer" })
		.min(10, { message: "limit must be at least 10" })
		.max(100, { message: "limit must be at most 100" })
		.default(10),

	offset: z
		.number({
			invalid_type_error: "offset must be a number",
		})
		.int({ message: "offset must be an integer" })
		.min(0, { message: "offset must be at least 0" })
		.optional()
		.default(0),

	statuses: z
		.array(
			z.nativeEnum(CusProductStatus, {
				errorMap: () => ({
					message: `status must be one of: ${Object.values(CusProductStatus).join(", ")}`,
				}),
			}),
			{
				invalid_type_error: "statuses must be an array of strings",
			},
		)
		.optional()
		.refine(
			(statuses) =>
				!statuses ||
				statuses.every((status) =>
					Object.values(CusProductStatus).includes(status),
				),
			{
				message: `statuses must contain only valid values: ${Object.values(CusProductStatus).join(", ")}`,
			},
		),
});

export const handleBatchCustomers = async (req: any, res: any) =>
	routeHandler({
		req,
		res,
		action: "batch get customers",
		queryValidator: schema,
		loader: async ({
			query,
			req,
		}: {
			query: z.infer<typeof schema>;
			req: ExtendedRequest;
		}) => {
			return await CusBatchService.getPage({
				db: req.db,
				ch: req.clickhouseClient,
				org: req.org,
				env: req.env,
				limit: query.limit,
				offset: query.offset,
				features: req.features,
				statuses: query.statuses ?? [],
				logger: req.logtail,
				reqApiVersion: req.apiVersion,
			});
		},
		handler: async (_, res: Response, data, query: z.infer<typeof schema>) => {
			if (data) {
				res.status(200).json({
					list: data,
					total: data.length,
					limit: query.limit,
					offset: query.offset,
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
