import {
	filterCustomerProductsByStripeSubscriptionId,
	isCustomerProductOnStripeSubscriptionSchedule,
} from "@autumn/shared";
import { createStripeCli } from "@/external/connect/createStripeCli";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { fetchStripeSyncSchedule } from "@/internal/billing/v2/providers/stripe/utils/sync/fetchStripeSyncObjects";
import { CusService } from "@/internal/customers/CusService";
import { ProductService } from "@/internal/products/ProductService";
import { subscriptionToSyncParams } from "../subscriptionToSyncParams";

const listAllStripeObjects = async <T extends { id: string }>({
	listPage,
}: {
	listPage: (startingAfter?: string) => Promise<{
		data: T[];
		has_more: boolean;
	}>;
}) => {
	const objects: T[] = [];
	let startingAfter: string | undefined;
	do {
		const page = await listPage(startingAfter);
		objects.push(...page.data);
		startingAfter = page.has_more
			? page.data[page.data.length - 1]?.id
			: undefined;
	} while (startingAfter);
	return objects;
};

export const prepareAutoSyncStripeCustomer = async ({
	ctx,
	customerId,
	stripeCustomerId,
}: {
	ctx: AutumnContext;
	customerId: string;
	stripeCustomerId: string;
}) => {
	const stripeCli = createStripeCli({ org: ctx.org, env: ctx.env });
	const [subscriptions, schedules, customer] = await Promise.all([
		listAllStripeObjects({
			listPage: (startingAfter) =>
				stripeCli.subscriptions.list({
					customer: stripeCustomerId,
					limit: 100,
					starting_after: startingAfter,
				}),
		}),
		listAllStripeObjects({
			listPage: (startingAfter) =>
				stripeCli.subscriptionSchedules.list({
					customer: stripeCustomerId,
					scheduled: true,
					limit: 100,
					starting_after: startingAfter,
				}),
		}),
		CusService.getFull({ ctx, idOrInternalId: customerId }),
	]);
	const pendingSubscriptions = subscriptions.filter(
		(subscription) =>
			filterCustomerProductsByStripeSubscriptionId({
				customerProducts: customer.customer_products,
				stripeSubscriptionId: subscription.id,
			}).length === 0,
	);
	const pendingSchedules = schedules.filter(
		(schedule) =>
			!customer.customer_products.some((customerProduct) =>
				isCustomerProductOnStripeSubscriptionSchedule({
					customerProduct,
					stripeSubscriptionScheduleId: schedule.id,
				}),
			),
	);
	if (pendingSubscriptions.length === 0 && pendingSchedules.length === 0) {
		return [];
	}

	const fullProducts = await ProductService.listFull({
		db: ctx.db,
		orgId: ctx.org.id,
		env: ctx.env,
	});
	return Promise.all([
		...pendingSubscriptions.map((subscription) =>
			subscriptionToSyncParams({
				ctx,
				customerId,
				subscription,
				customerProducts: customer.customer_products,
				fullProducts,
			}),
		),
		...pendingSchedules.map(async ({ id }) => {
			const schedule = await fetchStripeSyncSchedule({
				stripeCli,
				scheduleId: id,
			});
			return schedule
				? subscriptionToSyncParams({
						ctx,
						customerId,
						schedule,
						customerProducts: customer.customer_products,
						fullProducts,
					})
				: null;
		}),
	]);
};
