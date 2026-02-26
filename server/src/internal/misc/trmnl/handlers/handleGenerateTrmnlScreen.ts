import { type Feature, getFeatureName, RecaseError } from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { eventActions } from "@/internal/analytics/actions/eventActions.js";

function numberWithCommas(x: number | string) {
	return x.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/**
 * Generate TRMNL screen data for the device
 */
export const handleGenerateTrmnlScreen = createRoute({
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { org, features } = ctx;

		const { result } = await eventActions.getTopEventNames({
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

		// Get total event count for the top event
		const countAndSum = await eventActions.getCountAndSum({
			ctx,
			params: {
				event_names: [topEvent],
				interval: "30d",
				aggregateAll: true,
				bin_size: "day",
			},
		});

		let totalEvents: number | string = countAndSum[topEvent]?.count ?? 0;
		if (!totalEvents) {
			totalEvents = "Unknown";
		}

		// Revenue: stubbed to 0 for now (Tinybird only stores events today)
		const monthlyRevenue = {
			total_payment_volume: 0,
			label: "N/A",
		};

		// Get timeseries data for the chart
		const { formatted: results } = await eventActions.aggregate({
			ctx,
			params: {
				event_names: [topEvent],
				interval: "30d",
				aggregateAll: true,
				bin_size: "day",
			},
		});

		// Total customers: stubbed to 0 for now (Tinybird only stores events today)
		const totalCustomers: number | string = 0;

		const data = results?.data ?? [];

		// Access hideRevenue from the trmnl context set by middleware
		const hideRevenue = (org as any).hideRevenue ?? false;

		return c.json({
			rowData: `[${data.map((row: any) => `['${row.period}', ${row[`${topEvent}_count`]}]`).join(",")}]`,
			revenue: numberWithCommas(monthlyRevenue.total_payment_volume),
			totalEvents: numberWithCommas(totalEvents),
			totalCustomers: numberWithCommas(totalCustomers),
			topEvent: featureName || "Unknown",
			hideRevenue,
		});
	},
});
