import { ErrCode, type FullCustomer } from "@autumn/shared";
import { format } from "date-fns";
import { Router } from "express";
import { StatusCodes } from "http-status-codes";
import z from "zod";
import { AnalyticsService } from "@/internal/analytics/AnalyticsService.js";
import { CusService } from "@/internal/customers/CusService.js";
import RecaseError from "@/utils/errorUtils.js";
import { routeHandler } from "@/utils/routerUtils.js";

const analyticsRouter = Router();

const RangeEnum = z.enum(["24h", "7d", "30d", "90d", "last_cycle"]);
type Range = z.infer<typeof RangeEnum>;

analyticsRouter.post("", (req, res) =>
	routeHandler({
		req,
		res,
		action: "api query analytics data",
		handler: async (req, res) => {
			const { org, db, env } = req;
			const {
				customer_id,
				feature_id,
			}: { customer_id: string; feature_id: string | string[] } = req.body;

			if (!customer_id || !feature_id) {
				throw new RecaseError({
					message: "Fields customer_id and feature_id are required",
					code: ErrCode.InvalidInputs,
					statusCode: 400,
				});
			}

			let range: any = RangeEnum.nullish().parse(req.body.range);

			if (range === "last_cycle" || !range) {
				range = "1bc";
			}

			const customer = (await CusService.getFull({
				db,
				orgId: org.id,
				idOrInternalId: customer_id,
				env,
				withSubs: true,
			})) as FullCustomer;

			if (!customer) {
				throw new RecaseError({
					message: "Customer not found",
					code: ErrCode.CustomerNotFound,
					statusCode: StatusCodes.NOT_FOUND,
				});
			}

			let featureIds: string[] = [];

			if (Array.isArray(feature_id)) featureIds = feature_id;
			else featureIds = [feature_id];

			const events = await AnalyticsService.getTimeseriesEvents({
				req,
				params: {
					interval: range,
					event_names: featureIds,
					customer_id: customer_id,
					no_count: true,
				},
				customer,
			});

			if (!events) {
				throw new RecaseError({
					message: "No events found",
					code: ErrCode.InternalError,
					statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
				});
			}

			events.data.forEach((event: any) => {
				event["period"] = parseInt(format(new Date(event["period"]), "T"));
			});

			const usageList = events.data.filter(
				(event: any) => event.period <= Date.now(),
			);

			res.status(200).json({
				list: usageList,
			});
		},
	}),
);

export { analyticsRouter };
