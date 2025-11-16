import { type Feature, getFeatureName } from "@autumn/shared";
import { Router } from "express";
import rateLimit from "express-rate-limit";
import { AnalyticsService } from "@/internal/analytics/AnalyticsService.js";
import { RevenueService } from "@/internal/analytics/RevenueService.js";
import { withOrgAuth } from "@/middleware/authMiddleware.js";
import { trmnlAuthMiddleware } from "@/middleware/trmnlAuthMiddleware.js";
import { routeHandler } from "@/utils/routerUtils.js";
import { CacheManager } from "../../../utils/cacheUtils/CacheManager";

const trmnlLimiter = rateLimit({
	windowMs: 60 * 1000 * 30,
	limit: process.env.NODE_ENV === "development" ? 1000 : 10,
	standardHeaders: "draft-8",
	legacyHeaders: false,
	validate: { xForwardedForHeader: false },
});

const trmnlRouter = Router();

function numberWithCommas(x: number | string) {
	return x.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

trmnlRouter.get("/device_id", withOrgAuth, async (req: any, res: any) => {
	routeHandler({
		req,
		res,
		action: "get trmnl data",
		handler: async () => {
			const orgId = req.org.id;

			const trmnlConfig = await CacheManager.getJson<{
				deviceId: string;
				hideRevenue: boolean;
			}>(`trmnl:org:${orgId}`);

			res.status(200).json({ trmnlConfig });
		},
	});
});

trmnlRouter.post("/device_id", withOrgAuth, async (req: any, res: any) => {
	routeHandler({
		req,
		res,
		action: "save trmnl device id",
		handler: async () => {
			const trmnlConfig = await CacheManager.getJson<{
				orgId: string;
				hideRevenue: boolean;
			}>(`trmnl:device:${req.body.deviceId}`);

			if (trmnlConfig && trmnlConfig.orgId !== req.org.id) {
				return res.status(400).json({ error: "Device ID already taken" });
			}

			const curTrmnlConfig = await CacheManager.getJson<{
				deviceId: string;
				hideRevenue: boolean;
			}>(`trmnl:org:${req.org.id}`);
			if (curTrmnlConfig) {
				await CacheManager.del(`trmnl:device:${curTrmnlConfig.deviceId}`);
			}

			await CacheManager.setJson(`trmnl:device:${req.body.deviceId}`, {
				orgId: req.org.id,
				hideRevenue: req.body.hideRevenue,
			});

			await CacheManager.setJson(`trmnl:org:${req.org.id}`, {
				deviceId: req.body.deviceId,
				hideRevenue: req.body.hideRevenue,
			});

			res.status(200).json({ message: "Device ID saved" });
		},
	});
});

trmnlRouter.post(
	"/screen",
	trmnlLimiter,
	trmnlAuthMiddleware,
	async (req: any, res: any) =>
		routeHandler({
			req,
			res,
			action: "generate trmnl screen",
			handler: async () => {
				const { result }: any = await AnalyticsService.getTopEventNames({
					req,
					limit: 1,
				});

				let topEvent = "Unknown";
				if (result && result.data.length > 0) {
					topEvent = result.data[0].event_name;
				}

				if (topEvent === "Unknown") {
					res.status(500).json({ error: "No events found" });
					return;
				}

				const feature = req.features.find((feature: Feature) => {
					return (
						feature.id === topEvent || feature.event_names.includes(topEvent)
					);
				});

				const featureName = getFeatureName({
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
					rowData: `[${results.data.map((row: any) => `['${row.period}', ${row[`${topEvent}_count`]}]`).join(",")}]`,
					revenue: numberWithCommas(monthlyRevenue.total_payment_volume),
					totalEvents: numberWithCommas(totalEvents),
					totalCustomers: numberWithCommas(totalCustomers),
					topEvent: featureName || "Unknown",
					hideRevenue: req.org.hideRevenue,
				});
			},
		}),
);

export { trmnlRouter };
