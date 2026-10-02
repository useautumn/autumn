/**
 * set_plans with a future phases[0].starts_at only ends the plans in the request's scope:
 * - a targeted subscription is cancelled once its plans end, and another subscription is untouched;
 * - an entity's plan ends now while another entity's plan keeps the shared subscription,
 *   and the new plan joins that subscription's schedule at the start.
 */

import { expect, test } from "bun:test";
import { CusProductStatus } from "@autumn/shared";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { addDays } from "date-fns";
import { initMultiSubScenario } from "../multi-sub/multiSubScenario";
import {
	expectFutureStartScheduleCorrect,
	findLiveCustomerProduct,
	startsAtProducts,
} from "./utils/futureStartUtils";

test.concurrent(
	`${chalk.yellowBright("set-plans starts_at: a targeted subscription is cancelled for a future start, leaving the other one alone")}`,
	async () => {
		const customerId = "set-plans-future-start-targeted";
		const { autumnV2_4, ctx, advancedTo, subscriptionA, subscriptionB, plans } =
			await initMultiSubScenario({ customerId });
		const seatsBefore = await findLiveCustomerProduct({
			ctx,
			customerId,
			productId: plans.seats.id,
		});
		const startsAt = addDays(advancedTo, 7).getTime();

		await autumnV2_4.billing.setPlans({
			customer_id: customerId,
			stripe_subscription_id: subscriptionA,
			phases: [{ starts_at: startsAt, plans: [{ plan_id: plans.premium.id }] }],
		});

		await expectCustomerProducts({
			customerId,
			scheduled: [plans.premium.id],
			notPresent: [plans.pro.id],
		});
		await expectFutureStartScheduleCorrect({
			ctx,
			customerProduct: await findLiveCustomerProduct({
				ctx,
				customerId,
				productId: plans.premium.id,
			}),
			startsAt,
		});
		const seatsAfter = await findLiveCustomerProduct({
			ctx,
			customerId,
			productId: plans.seats.id,
		});
		expect(seatsAfter.id).toBe(seatsBefore.id);
		expect(seatsAfter.subscription_ids).toEqual([subscriptionB]);
		expect(
			(await ctx.stripeCli.subscriptions.retrieve(subscriptionA)).status,
		).toBe("canceled");
		expect(
			(await ctx.stripeCli.subscriptions.retrieve(subscriptionB)).status,
		).toBe("active");
	},
);

test.concurrent(
	`${chalk.yellowBright("set-plans starts_at: another entity's plan keeps the shared subscription, which the new plan joins at the start")}`,
	async () => {
		const { pro, premium } = startsAtProducts();
		const { customerId, autumnV2_2, ctx, advancedTo, entities } =
			await initScenario({
				customerId: "set-plans-future-start-entities",
				setup: [
					s.customer({ paymentMethod: "success" }),
					s.products({ list: [pro, premium] }),
					s.entities({ count: 2, featureId: TestFeature.Users }),
				],
				actions: [
					s.billing.attach({ productId: pro.id, entityIndex: 0 }),
					s.billing.attach({ productId: pro.id, entityIndex: 1 }),
				],
			});
		const [firstEntity, secondEntity] = entities;
		const otherEntityPro = await findLiveCustomerProduct({
			ctx,
			customerId,
			productId: pro.id,
			entityId: secondEntity!.id,
		});
		const sharedSubscriptionId = otherEntityPro.subscription_ids![0]!;
		const startsAt = addDays(advancedTo, 7).getTime();

		await autumnV2_2.billing.setPlans({
			customer_id: customerId,
			entity_id: firstEntity!.id,
			phases: [{ starts_at: startsAt, plans: [{ plan_id: premium.id }] }],
		});

		const scheduledPremium = await findLiveCustomerProduct({
			ctx,
			customerId,
			productId: premium.id,
			entityId: firstEntity!.id,
		});
		expect(scheduledPremium.status).toBe(CusProductStatus.Scheduled);
		await expect(
			findLiveCustomerProduct({
				ctx,
				customerId,
				productId: pro.id,
				entityId: firstEntity!.id,
			}),
		).rejects.toThrow();
		const keptPro = await findLiveCustomerProduct({
			ctx,
			customerId,
			productId: pro.id,
			entityId: secondEntity!.id,
		});
		expect(keptPro.id).toBe(otherEntityPro.id);
		expect(keptPro.status).toBe(CusProductStatus.Active);

		const schedule = await expectFutureStartScheduleCorrect({
			ctx,
			customerProduct: scheduledPremium,
			startsAt,
			createsSubscriptionLater: false,
		});
		expect(schedule.subscription).toBe(sharedSubscriptionId);
		expect(
			(await ctx.stripeCli.subscriptions.retrieve(sharedSubscriptionId)).status,
		).toBe("active");
	},
);
