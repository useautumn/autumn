import { type Feature, getFeatureName } from "@autumn/shared";
import { Router } from "express";
import rateLimit from "express-rate-limit";
import { AnalyticsService } from "@/internal/analytics/AnalyticsService.js";
import { RevenueService } from "@/internal/analytics/RevenueService.js";
import { initUpstash } from "@/internal/customers/cusCache/upstashUtils.js";
import { withOrgAuth } from "@/middleware/authMiddleware.js";
import { trmnlAuthMiddleware } from "@/middleware/trmnlAuthMiddleware.js";
import { routeHandler } from "@/utils/routerUtils.js";

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
			const upstash = await initUpstash();

			if (!upstash)
				res.status(500).json({ error: "Failed to connect to upstash" });

			const orgId = req.org.id;
			const trmnlConfig = await upstash?.get(`trmnl:org:${orgId}`);

			res.status(200).json({ trmnlConfig });
			// let trmnlJson = await getTrmnlJson();

			// let deviceId = Object.keys(trmnlJson).find((deviceId: string) => {
			//   return trmnlJson[deviceId] === req.org.id;
			// });

			// res.status(200).json({ deviceId });
		},
	});
});

trmnlRouter.post("/device_id", withOrgAuth, async (req: any, res: any) => {
	routeHandler({
		req,
		res,
		action: "save trmnl device id",
		handler: async () => {
			let upstash = await initUpstash();

			if (!upstash)
				res.status(500).json({ error: "Failed to connect to upstash" });

			// 1. Get upstash data
			upstash = upstash!;

			const trmnlConfig = (await upstash.get(
				`trmnl:device:${req.body.deviceId}`,
			)) as {
				orgId: string;
				hideRevenue: boolean;
			};
			if (trmnlConfig && trmnlConfig.orgId !== req.org.id) {
				return res.status(400).json({ error: "Device ID already taken" });
			}

			// Get current device ID:
			const curTrmnlConfig = (await upstash.get(`trmnl:org:${req.org.id}`)) as {
				deviceId: string;
				hideRevenue: boolean;
			};
			if (curTrmnlConfig) {
				await upstash.del(`trmnl:device:${curTrmnlConfig.deviceId}`);
			}

			await upstash.set(`trmnl:device:${req.body.deviceId}`, {
				orgId: req.org.id,
				hideRevenue: req.body.hideRevenue,
			});

			await upstash.set(`trmnl:org:${req.org.id}`, {
				deviceId: req.body.deviceId,
				hideRevenue: req.body.hideRevenue,
			});

			// const trmnlJson = await upstash.get(`trmnl:${req.org.id}`);

			// if (!trmnlJson) {
			//   res.status(400).json({ error: "Device ID not found" });
			// }

			// 2. Check if device ID is already taken
			// await upstash?.set(`trmnl:${req.org.id}`, req.body.deviceId);

			// let trmnlJson = await getTrmnlJson();

			// let existingOrgId = trmnlJson[req.body.deviceId];

			// if (existingOrgId && existingOrgId !== req.org.id) {
			//   return res.status(400).json({ error: "Device ID already taken" });
			// }

			// trmnlJson[req.body.deviceId] = req.org.id;
			// // console.log("Trmnl JSON")
			// const sb = createSupabaseClient();
			// await sb.storage
			//   .from("private")
			//   .upload("trmnl.json", JSON.stringify(trmnlJson), {
			//     upsert: true,
			//   });

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

				// console.log({
				//   rowData: `[${results.data.map((row: any) => `['${row.period}', ${row[topEvent[0] + "_count"]}]`).join(",")}]`,
				//   revenue: numberWithCommas(monthlyRevenue.total_payment_volume),
				//   totalEvent: numberWithCommas(totalEvents),
				//   totalCustomers: numberWithCommas(totalCustomers),
				//   topEvent: topEvent[0],
				// });
				res.status(200).json({
					rowData: `[${results.data.map((row: any) => `['${row.period}', ${row[topEvent + "_count"]}]`).join(",")}]`,
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
