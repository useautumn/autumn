import { AnalyticsService } from "@/internal/analytics/AnalyticsService.js";
import { RevenueService } from "@/internal/analytics/RevenueService.js";
import { ExtendedRequest } from "@/utils/models/Request.js";
import { routeHandler } from "@/utils/routerUtils.js";
import { ErrCode, Feature, getFeatureName } from "@autumn/shared";
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
			let { result }: any = await AnalyticsService.getTopEventNames({
				req,
				limit: 1,
			});

			let topEvent = "Unknown";
			if (result && result.data.length > 0) {
				topEvent = result.data[0].event_name;
			}

			let feature = req.features.find((feature: Feature) => {
				return (
					feature.id === topEvent ||
					(feature.config?.filters?.flatMap(
						(x: { value: string[] }) => [...x.value]
					) &&
						feature.config.filters
							.flatMap((x: { value: string[] }) => [...x.value])
							.includes(topEvent))
				);
			});

			let featureName = getFeatureName({
				feature,
				plural: true,
			});

			let totalEvents: number | string =
				await AnalyticsService.getTotalEvents({
					req,
					eventName: topEvent,
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
					event_names: [topEvent],
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

			res.status(200).json({
				rowData: `[${results.data.map((row: any) => `['${row.period}', ${row[topEvent + "_count"]}]`).join(",")}]`,
				revenue: numberWithCommas(monthlyRevenue.total_payment_volume),
				totalEvents: numberWithCommas(totalEvents),
				totalCustomers: numberWithCommas(totalCustomers),
				topEvent: featureName || "Unknown",
				hideRevenue: req.org.hideRevenue,
			});
		},
	})
);

export { trmnlRouter };
