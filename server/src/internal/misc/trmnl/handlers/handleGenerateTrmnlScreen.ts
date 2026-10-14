import { type Feature, getFeatureName, RecaseError, Scopes } from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { eventActions } from "@/internal/analytics/actions/eventActions.js";

function numberWithCommas(x: number | string) {
	return x.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

export const handleGenerateTrmnlScreen = createRoute({
	scopes: [Scopes.Analytics.Read],
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

		const monthlyRevenue = {
			total_payment_volume: 0,
			label: "N/A",
		};

		const { formatted: results } = await eventActions.aggregate({
			ctx,
			params: {
				event_names: [topEvent],
				interval: "30d",
				aggregateAll: true,
				bin_size: "day",
			},
		});

		const totalCustomers: number | string = 0;

		const data = results?.data ?? [];

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
