import { type Feature, getFeatureName, RecaseError } from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { AnalyticsService } from "@/internal/analytics/AnalyticsService.js";
import { RevenueService } from "@/internal/analytics/RevenueService.js";

function numberWithCommas(x: number | string) {
	return x.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/**
 * Generate TRMNL screen data for the device
 */
export const handleGenerateTrmnlScreen = createRoute({
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { org, features, clickhouseClient, env, db, logger } = ctx;

		const { result }: any = await AnalyticsService.getTopEventNames({
			ctx,
			limit: 1,
		});

		let topEvent = "Unknown";
		if (result && result.data.length > 0) {
			topEvent = result.data[0].event_name;
		}

		if (topEvent === "Unknown") {
			throw new RecaseError({ message: "No events found" });
		}

		const feature = features.find((f: Feature) => {
			return f.id === topEvent || f.event_names.includes(topEvent);
		});

		const featureName = getFeatureName({
			feature,
			plural: true,
		});

		let totalEvents: number | string = await AnalyticsService.getTotalEvents({
			ctx,
			eventName: topEvent,
		});

		if (!totalEvents) {
			totalEvents = "Unknown";
		}

		let monthlyRevenue:
			| { total_payment_volume: number; label: string }
			| string = await RevenueService.getMonthlyRevenue({
			ctx,
		});

		if (!monthlyRevenue) {
			monthlyRevenue = {
				total_payment_volume: 0,
				label: "Unknown",
			};
		}

		let results = await AnalyticsService.getTimeseriesEvents({
			ctx,
			params: {
				event_names: [topEvent],
				interval: "30d",
			},
			aggregateAll: true,
		});

		let totalCustomers: number | string =
			await AnalyticsService.getTotalCustomers({
				ctx,
			});

		if (!totalCustomers) {
			totalCustomers = "Unknown";
		}

		if (!results?.data) {
			results = {
				data: [],
			};
		}

		// Access hideRevenue from the trmnl context set by middleware
		const hideRevenue = (org as any).hideRevenue ?? false;

		return c.json({
			rowData: `[${results.data.map((row: any) => `['${row.period}', ${row[`${topEvent}_count`]}]`).join(",")}]`,
			revenue: numberWithCommas(monthlyRevenue.total_payment_volume),
			totalEvents: numberWithCommas(totalEvents),
			totalCustomers: numberWithCommas(totalCustomers),
			topEvent: featureName || "Unknown",
			hideRevenue,
		});
	},
});
