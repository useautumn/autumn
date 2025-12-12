import {
	AnalyticsAggregationBodySchema,
	ErrCode,
	type FullCustomer,
	RecaseError,
} from "@autumn/shared";
import { format } from "date-fns";
import { StatusCodes } from "http-status-codes";
import { CusService } from "@/internal/customers/CusService";
import { createRoute } from "../../../honoMiddlewares/routeHandler";
import { AnalyticsServiceV2 } from "../AnalyticsServiceV2";

export const handleAnalyticsAggregation = createRoute({
	body: AnalyticsAggregationBodySchema,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { db, org, env } = ctx;
		const { customer_id, feature_id, group_by, range, bin_size, custom_range } =
			c.req.valid("json");

		if (!customer_id || !feature_id) {
			throw new RecaseError({
				message: "Fields customer_id and feature_id are required",
				code: ErrCode.InvalidInputs,
				statusCode: StatusCodes.BAD_REQUEST,
			});
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

		const [events, total] = await Promise.all([
			AnalyticsServiceV2.getTimeseriesEvents({
				ctx,
				params: {
					aggregateAll: false,
					interval: range,
					event_names: featureIds,
					customer_id: customer_id,
					no_count: true,
					customer,
					group_by,
					bin_size,
					custom_range,
				},
			}),
			AnalyticsServiceV2.getTotalEvents({
				ctx,
				params: {
					aggregateAll: false,
					interval: range,
					event_names: featureIds,
					customer_id: customer_id,
					customer,
					custom_range,
					bin_size,
				},
			}),
		]);

		if (!events) {
			throw new RecaseError({
				message: "No events found",
				code: ErrCode.InternalError,
				statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
			});
		}

		events.data.forEach((event: any) => {
			event.period = parseInt(format(new Date(event.period), "T"));
		});

		let usageList = events.data.filter(
			(event: any) => event.period <= Date.now(),
		);

		if (group_by) {
			const allGroupValues = new Set<string>();
			const allFeatureNames = new Set<string>();
			for (const row of usageList) {
				const { period, [group_by]: groupValue, ...metrics } = row;
				if (groupValue != null && groupValue !== "") {
					allGroupValues.add(groupValue);
				}
				for (const featureName of Object.keys(metrics)) {
					allFeatureNames.add(featureName);
				}
			}

			const grouped = new Map<number, Record<string, any>>();
			for (const row of usageList) {
				const { period, [group_by]: groupValue, ...metrics } = row;

				if (!grouped.has(period)) {
					grouped.set(period, { period });
				}

				if (groupValue == null || groupValue === "") continue;

				const periodData = grouped.get(period)!;
				for (const [featureName, value] of Object.entries(metrics)) {
					if (!periodData[featureName]) {
						periodData[featureName] = {};
					}
					periodData[featureName][groupValue] = value;
				}
			}

			for (const periodData of grouped.values()) {
				for (const featureName of allFeatureNames) {
					if (!periodData[featureName]) {
						periodData[featureName] = {};
					}
					for (const groupValue of allGroupValues) {
						if (periodData[featureName][groupValue] === undefined) {
							periodData[featureName][groupValue] = 0;
						}
					}
				}
			}

			usageList = Array.from(grouped.values());
		}

		return c.json({
			list: usageList,
			total,
		});
	},
});
