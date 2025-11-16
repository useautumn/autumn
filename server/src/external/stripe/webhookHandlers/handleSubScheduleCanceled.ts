import type { AppEnv, Organization } from "@autumn/shared";
import type Stripe from "stripe";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService.js";

export const handleSubscriptionScheduleCanceled = async ({
	db,
	schedule,
	env,
	org,
}: {
	db: DrizzleCli;
	schedule: Stripe.SubscriptionSchedule;
	org: Organization;
	env: AppEnv;
}) => {
	const cusProductsOnSchedule = await CusProductService.getByScheduleId({
		db,
		scheduleId: schedule.id,
		orgId: org.id,
		env,
	});

	if (cusProductsOnSchedule.length === 0) return;
};
