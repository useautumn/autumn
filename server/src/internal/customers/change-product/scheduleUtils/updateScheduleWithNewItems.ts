import type { FullCusProduct, Organization } from "@autumn/shared";
import type { AppEnv } from "autumn-js";
import type Stripe from "stripe";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { SubService } from "@/internal/subscriptions/SubService.js";
import type { ItemSet } from "@/utils/models/ItemSet.js";
import { getFilteredScheduleItems } from "./getFilteredScheduleItems.js";

export const updateScheduledSubWithNewItems = async ({
	db,
	scheduleObj,
	newItems,
	cusProductsForGroup,
	stripeCli,
	itemSet,
	org,
	env,
}: {
	db: DrizzleCli;
	scheduleObj: any;
	newItems: any[];
	cusProductsForGroup: (FullCusProduct | undefined)[];
	stripeCli: Stripe;
	itemSet: ItemSet | null;
	org: Organization;
	env: AppEnv;
}) => {
	const { schedule } = scheduleObj;

	const filteredScheduleItems = getFilteredScheduleItems({
		scheduleObj,
		cusProducts: cusProductsForGroup,
	});

	// 2. Add new schedule items
	const newScheduleItems = filteredScheduleItems
		.map((item: any) => ({
			price: item.price,
		}))
		.concat(
			...newItems.map((item: any) => ({
				price: item.price,
			})),
		);

	const stripeSchedule = await stripeCli.subscriptionSchedules.update(
		schedule.id,
		{
			phases: [
				{
					items: newScheduleItems,
					start_date: schedule.phases[0].start_date,
				},
			],
		},
	);

	// Update sub schedule ID
	if (itemSet) {
		await SubService.addUsageFeatures({
			db,
			scheduleId: scheduleObj.schedule.id,
			usageFeatures: itemSet.usageFeatures,
			orgId: org.id,
			env: env,
		});
	}

	return stripeSchedule;
};
