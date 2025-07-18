import { AnalyticsService } from "@/internal/analytics/AnalyticsService.js";
import { RevenueService } from "@/internal/analytics/RevenueService.js";
import { ExtendedRequest } from "@/utils/models/Request.js";
import { routeHandler } from "@/utils/routerUtils.js";
import { Router } from "express";

const trmnlRouter = Router();

function numberWithCommas(x: number | string) {
	return x.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

trmnlRouter.post("/screen", async (req: any, res: any) =>
	routeHandler({
		req,
		res,
		action: "generate trmnl screen",
		handler: async () => {
			let topEvent: string[] = await AnalyticsService.getTopEventNames({
				req,
				limit: 1,
			});

			if (!topEvent) {
				topEvent = ["Unknown"];
			}

			let totalEvents: number | string =
				await AnalyticsService.getTotalEvents({
					req,
					eventName: topEvent[0],
				});

			if (!totalEvents) {
				totalEvents = "Unknown";
			}

			let monthlyRevenue:
				| { total_payment_volume: number; label: string }
				| string = await RevenueService.getMonthlyRevenue({
				req,
			});

			if (!monthlyRevenue) {
				monthlyRevenue = {
					total_payment_volume: 0,
					label: "Unknown",
				};
			}

			let results = await AnalyticsService.getTimeseriesEvents({
				req,
				params: {
					event_names: [topEvent[0]],
					interval: "30d",
				},
				aggregateAll: true,
			});

			let totalCustomers: number | string =
				await AnalyticsService.getTotalCustomers({ req });

			if (!totalCustomers) {
				totalCustomers = "Unknown";
			}

			if (!results?.data) {
				results = {
					data: [],
				};
			}

			console.log({
				rowData: `[${results.data.map((row: any) => `['${row.period}', ${row[topEvent[0] + "_count"]}]`).join(",")}]`,
				revenue: numberWithCommas(monthlyRevenue.total_payment_volume),
				totalEvent: numberWithCommas(totalEvents),
				totalCustomers: numberWithCommas(totalCustomers),
				topEvent: topEvent[0],
			});
			res.status(200).json({
				rowData: `[${results.data.map((row: any) => `['${row.period}', ${row[topEvent[0] + "_count"]}]`).join(",")}]`,
				revenue: numberWithCommas(monthlyRevenue.total_payment_volume),
				totalEvents: numberWithCommas(totalEvents),
				totalCustomers: numberWithCommas(totalCustomers),
				topEvent: topEvent[0],
			});
		},
	})
);

export { trmnlRouter };
