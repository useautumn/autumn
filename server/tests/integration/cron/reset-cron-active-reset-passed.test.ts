import { expect, test } from "bun:test";
import { customerEntitlements, ProductItemInterval } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { eq } from "drizzle-orm";
import { CusService } from "@/internal/customers/CusService";
import { CusEntService } from "@/internal/customers/cusProducts/cusEnts/CusEntitlementService";

const getMessageCusEnt = async ({
	ctx,
	customerId,
}: {
	ctx: Awaited<ReturnType<typeof initScenario>>["ctx"];
	customerId: string;
}) => {
	const fullCustomer = await CusService.getFull({
		ctx,
		idOrInternalId: customerId,
		skipReset: true,
	});

	const customerEntitlement = fullCustomer.customer_products
		.flatMap((customerProduct) => customerProduct.customer_entitlements)
		.find((cusEnt) => cusEnt.entitlement.feature_id === TestFeature.Messages);

	if (!customerEntitlement) {
		throw new Error(`Expected messages entitlement for ${customerId}`);
	}

	return customerEntitlement;
};

test.concurrent(
	`${chalk.yellowBright("reset cron: active reset passed only includes Autumn-owned price-backed entitlements")}`,
	async () => {
		const stripeOwnedCustomerId = "reset-cron-stripe-owned";
		const autumnOwnedCustomerId = "reset-cron-separate-interval";
		const stripeOwnedPlan = products.base({
			id: "reset-cron-stripe-owned",
			items: [items.prepaidMessages()],
		});
		const autumnOwnedPlan = products.base({
			id: "reset-cron-separate-interval",
			items: [
				items.prepaidMessages({
					priceInterval: ProductItemInterval.Year,
				}),
			],
		});

		const { ctx, autumnV2_2 } = await initScenario({
			customerId: stripeOwnedCustomerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [stripeOwnedPlan, autumnOwnedPlan] }),
			],
			actions: [],
		});
		await initScenario({
			customerId: autumnOwnedCustomerId,
			setup: [s.customer({ paymentMethod: "success" })],
			actions: [],
		});

		await autumnV2_2.billing.attach({
			customer_id: stripeOwnedCustomerId,
			plan_id: stripeOwnedPlan.id,
			feature_quantities: [
				{ feature_id: TestFeature.Messages, quantity: 300 },
			],
			redirect_mode: "if_required",
		});
		await autumnV2_2.billing.attach({
			customer_id: autumnOwnedCustomerId,
			plan_id: autumnOwnedPlan.id,
			feature_quantities: [
				{ feature_id: TestFeature.Messages, quantity: 300 },
			],
			redirect_mode: "if_required",
		});

		const stripeOwnedCusEnt = await getMessageCusEnt({
			ctx,
			customerId: stripeOwnedCustomerId,
		});
		const autumnOwnedCusEnt = await getMessageCusEnt({
			ctx,
			customerId: autumnOwnedCustomerId,
		});
		const now = Date.now();
		await ctx.db
			.update(customerEntitlements)
			.set({ next_reset_at: now - 1_000 })
			.where(eq(customerEntitlements.id, stripeOwnedCusEnt.id));
		await ctx.db
			.update(customerEntitlements)
			.set({ next_reset_at: now - 1_000 })
			.where(eq(customerEntitlements.id, autumnOwnedCusEnt.id));

		const resetCusEnts = await CusEntService.getActiveResetPassed({
			db: ctx.db,
			customDateUnix: now,
			includeSeparateIntervalResets: true,
		});
		const resetCusEntIds = resetCusEnts.map((cusEnt) => cusEnt.id);

		expect(resetCusEntIds).not.toContain(stripeOwnedCusEnt.id);
		expect(resetCusEntIds).toContain(autumnOwnedCusEnt.id);

		const resetCusEntsWithoutSeparateIntervals =
			await CusEntService.getActiveResetPassed({
				db: ctx.db,
				customDateUnix: now,
				includeSeparateIntervalResets: false,
			});
		const resetCusEntIdsWithoutSeparateIntervals =
			resetCusEntsWithoutSeparateIntervals.map((cusEnt) => cusEnt.id);

		expect(resetCusEntIdsWithoutSeparateIntervals).not.toContain(
			stripeOwnedCusEnt.id,
		);
		expect(resetCusEntIdsWithoutSeparateIntervals).not.toContain(
			autumnOwnedCusEnt.id,
		);
	},
);
