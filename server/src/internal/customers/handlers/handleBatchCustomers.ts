import { ExtendedRequest } from "@/utils/models/Request.js";
import { Response } from "express";
import { routeHandler } from "@/utils/routerUtils.js";
import { CusBatchService } from "../CusBatchService.js";
import RecaseError from "@/utils/errorUtils.js";
import { AppEnv, CusProductStatus, ErrCode, Organization, CusExpand } from "@autumn/shared";
import { DrizzleCli } from "@/db/initDrizzle.js";
import z from "zod";

const schema = z.object({
	page: z.number().int().min(1, { message: "Page must be greater than 0" }),
	pageSize: z.union([
		z.literal(10),
		z.literal(50),
		z.literal(100),
		z.literal(500),
	]).refine((val) => [10, 50, 100, 500].includes(val), {
		message: "Page size must be one of: 10, 50, 100, or 500",
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
	expand: z
		.array(z.nativeEnum(CusExpand))
		.optional()
		.refine(
			(expandItems) =>
				!expandItems ||
				expandItems.every((item) =>
					Object.values(CusExpand).includes(item)
				),
			{
				message: "Invalid expand options",
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
			console.log(`\n🚀 Starting batch customer query: page=${body.page}, pageSize=${body.pageSize}, statuses=[${body.statuses?.join(', ') || 'default'}], expand=[${body.expand?.join(', ') || 'none'}]`);
			const totalStart = Date.now();
			
			const customers = await CusBatchService.getPage({
				db,
				ch: req.clickhouseClient,
				org,
				env,
				page: body.page as number,
				pageSize: body.pageSize as 10 | 50 | 100 | 500,
				features: req.features,
				statuses: body.statuses ?? [],
				expand: body.expand ?? [],
				logger: req.logtail,
				reqApiVersion: req.apiVersion,
			});
			
			const totalTime = Date.now() - totalStart;
			console.log(`✅ Batch query completed: ${totalTime}ms\n`);

			return {
				customers,
			};
		},
		handler: async (_, res: Response, load) => {
			if (load.customers) {
				res.status(200).json({
					list: load.customers,
					total: load.customers.length,
				});
			} else {
				throw new RecaseError({
					message: "No customers found",
					code: ErrCode.CustomersNotFound,
				});
			}
		},
	});