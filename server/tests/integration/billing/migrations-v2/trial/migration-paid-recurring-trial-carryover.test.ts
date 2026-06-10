/**
 * Regression coverage for paid recurring trials during update_plan migrations.
 * Migrations must preserve active Stripe trial state in normal and entity-scoped setups.
 */

import { expect, test } from "bun:test";
import type { ApiCustomerV3, ApiEntityV0, Migration } from "@autumn/shared";
import type { MigrationFilter } from "@autumn/shared/api/migrations/filters/migrationFilter.js";
import type { Operations } from "@autumn/shared/api/migrations/operations/operations.js";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectProductTrialing } from "@tests/integration/billing/utils/expectCustomerProductTrialing";
import { expectStripeSubscriptionUnchanged } from "@tests/integration/billing/utils/stripe/expectStripeSubscriptionUnchanged";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import type { TestContext } from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import type Stripe from "stripe";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { prepare } from "@/internal/migrations/v2/prepare/prepare.js";
import { migrateCustomer } from "@/internal/migrations/v2/run/migrateCustomer/index.js";
import { preProcessMigration } from "@/internal/migrations/v2/run/preProcess/index.js";

type MigrationClient = {
	migrationsV2: {
		deleteAndCreate: (params: {
			id: string;
			filter?: MigrationFilter | null;
			operations?: Operations | null;
		}) => Promise<Migration>;
	};
};

type TrialSubSnapshot = {
	id: string;
	trialEnd: number | null;
	subscription: Stripe.Subscription;
};

const activeOrTrialing = (sub: Stripe.Subscription) =>
	sub.status === "active" || sub.status === "trialing";

const getTrialSubSnapshots = async ({
	ctx,
	stripeCustomerId,
}: {
	ctx: TestContext;
	stripeCustomerId: string;
}): Promise<TrialSubSnapshot[]> => {
	const subscriptions = await ctx.stripeCli.subscriptions.list({
		customer: stripeCustomerId,
		status: "all",
	});
	const activeSubs = subscriptions.data.filter(activeOrTrialing);
	expect(activeSubs.length).toBeGreaterThan(0);

	return activeSubs.map((subscription) => {
		expect(subscription.status).toBe("trialing");
		expect(subscription.trial_end).toBeDefined();
		return {
			id: subscription.id,
			trialEnd: subscription.trial_end,
			subscription,
		};
	});
};

const expectTrialSubsPreserved = async ({
	ctx,
	before,
	expectUnchanged,
}: {
	ctx: TestContext;
	before: TrialSubSnapshot[];
	expectUnchanged: boolean;
}) => {
	for (const snapshot of before) {
		const after = await ctx.stripeCli.subscriptions.retrieve(snapshot.id);
		expect(after.status).toBe("trialing");
		expect(after.trial_end).toBe(snapshot.trialEnd);

		if (expectUnchanged) {
			expectStripeSubscriptionUnchanged({
				before: snapshot.subscription,
				after,
			});
		}
	}
};

const runVersionMigration = async ({
	ctx,
	migrationClient,
	migrationId,
	customerId,
	filter,
	operations,
	noBillingChanges,
}: {
	ctx: AutumnContext;
	migrationClient: MigrationClient;
	migrationId: string;
	customerId: string;
	filter: MigrationFilter;
	operations: Operations;
	noBillingChanges: boolean;
}) => {
	const migration = await migrationClient.migrationsV2.deleteAndCreate({
		id: migrationId,
		filter,
		operations,
	});
	const processedMigration = preProcessMigration({
		...migration,
		no_billing_changes: noBillingChanges,
	});
	const { preparedState } = await prepare({
		ctx,
		migration: processedMigration,
		dryRun: false,
	});

	await migrateCustomer({
		ctx,
		customerId,
		migration: {
			...processedMigration,
			prepared_state: preparedState,
		},
	});
};

const updateTrialProductsToV2 = async ({
	autumnV1,
	proId,
	addonId,
}: {
	autumnV1: Awaited<ReturnType<typeof initScenario>>["autumnV1"];
	proId: string;
	addonId: string;
}) => {
	await autumnV1.products.update(proId, {
		items: [
			items.monthlyPrice({ price: 20 }),
			items.monthlyMessages({ includedUsage: 600 }),
		],
	});
	await autumnV1.products.update(addonId, {
		items: [
			items.monthlyPrice({ price: 20 }),
			items.monthlyWords({ includedUsage: 300 }),
		],
	});
};

const migrationOps = ({
	proId,
	addonId,
}: {
	proId: string;
	addonId: string;
}): Operations => ({
	customer: [
		{
			type: "update_plan",
			plan_filter: { plan_id: proId },
			version: 2,
		},
		{
			type: "update_plan",
			plan_filter: { plan_id: addonId },
			version: 2,
		},
	],
});

for (const noBillingChanges of [false, true]) {
	test.concurrent(
		`${chalk.yellowBright(`migrations trial: paid pro + addon preserves trial (${noBillingChanges ? "no billing changes" : "billing changes"})`)}`,
		async () => {
			const suffix = noBillingChanges ? "db-only" : "billing";
			const customerId = `mig-paid-trial-regular-${suffix}`;
			const proTrial = products.proWithTrial({
				id: "mig-paid-trial-pro",
				items: [items.monthlyMessages({ includedUsage: 500 })],
				trialDays: 14,
				cardRequired: true,
			});
			const addon = products.recurringAddOn({
				id: "mig-paid-trial-addon",
				items: [items.monthlyWords({ includedUsage: 200 })],
			});

			const { autumnV1, autumnV2_2, ctx } = await initScenario({
				customerId,
				setup: [
					s.customer({ paymentMethod: "success" }),
					s.products({ list: [proTrial, addon] }),
				],
				actions: [
					s.billing.attach({ productId: proTrial.id }),
					s.billing.attach({ productId: addon.id }),
				],
			});

			const customerBefore =
				await autumnV1.customers.get<ApiCustomerV3>(customerId);
			const trialEndsAt = await expectProductTrialing({
				customer: customerBefore,
				productId: proTrial.id,
			});
			expect(trialEndsAt).toBeDefined();
			await expectProductTrialing({
				customer: customerBefore,
				productId: addon.id,
				trialEndsAt: trialEndsAt!,
			});
			expect(customerBefore.stripe_id).toBeDefined();
			const subSnapshots = await getTrialSubSnapshots({
				ctx,
				stripeCustomerId: customerBefore.stripe_id as string,
			});

			await updateTrialProductsToV2({
				autumnV1,
				proId: proTrial.id,
				addonId: addon.id,
			});

			await runVersionMigration({
				ctx,
				migrationClient: autumnV2_2,
				migrationId: `${customerId}-mig`,
				customerId,
				filter: { customer: { plan: { plan_id: proTrial.id } } },
				operations: migrationOps({ proId: proTrial.id, addonId: addon.id }),
				noBillingChanges,
			});

			const customerAfter =
				await autumnV1.customers.get<ApiCustomerV3>(customerId);
			await expectCustomerProducts({
				customer: customerAfter,
				active: [proTrial.id, addon.id],
			});
			await expectProductTrialing({
				customer: customerAfter,
				productId: proTrial.id,
				trialEndsAt: trialEndsAt!,
			});
			await expectProductTrialing({
				customer: customerAfter,
				productId: addon.id,
				trialEndsAt: trialEndsAt!,
			});
			await expectTrialSubsPreserved({
				ctx,
				before: subSnapshots,
				expectUnchanged: noBillingChanges,
			});
		},
	);

	test.concurrent(
		`${chalk.yellowBright(`migrations trial: multi-entity pro + addon preserves trial (${noBillingChanges ? "no billing changes" : "billing changes"})`)}`,
		async () => {
			const suffix = noBillingChanges ? "db-only" : "billing";
			const customerId = `mig-paid-trial-entities-${suffix}`;
			const proTrial = products.proWithTrial({
				id: "mig-paid-trial-ent-pro",
				items: [items.monthlyMessages({ includedUsage: 500 })],
				trialDays: 14,
				cardRequired: true,
			});
			const addon = products.recurringAddOn({
				id: "mig-paid-trial-ent-addon",
				items: [items.monthlyWords({ includedUsage: 200 })],
			});

			const { autumnV1, autumnV2_2, ctx, entities } = await initScenario({
				customerId,
				setup: [
					s.customer({ paymentMethod: "success" }),
					s.products({ list: [proTrial, addon] }),
					s.entities({ count: 2, featureId: TestFeature.Users }),
				],
				actions: [
					s.billing.attach({ productId: proTrial.id, entityIndex: 0 }),
					s.billing.attach({ productId: addon.id, entityIndex: 0 }),
					s.billing.attach({ productId: proTrial.id, entityIndex: 1 }),
					s.billing.attach({ productId: addon.id, entityIndex: 1 }),
				],
			});

			const entityBefore = await autumnV1.entities.get<ApiEntityV0>(
				customerId,
				entities[0].id,
			);
			const trialEndsAt = await expectProductTrialing({
				customer: entityBefore,
				productId: proTrial.id,
			});
			expect(trialEndsAt).toBeDefined();

			for (const entity of entities) {
				const entityCustomer = await autumnV1.entities.get<ApiEntityV0>(
					customerId,
					entity.id,
				);
				await expectProductTrialing({
					customer: entityCustomer,
					productId: proTrial.id,
					trialEndsAt: trialEndsAt!,
				});
				await expectProductTrialing({
					customer: entityCustomer,
					productId: addon.id,
					trialEndsAt: trialEndsAt!,
				});
			}

			const customerBefore =
				await autumnV1.customers.get<ApiCustomerV3>(customerId);
			expect(customerBefore.stripe_id).toBeDefined();
			const subSnapshots = await getTrialSubSnapshots({
				ctx,
				stripeCustomerId: customerBefore.stripe_id as string,
			});

			await updateTrialProductsToV2({
				autumnV1,
				proId: proTrial.id,
				addonId: addon.id,
			});

			await runVersionMigration({
				ctx,
				migrationClient: autumnV2_2,
				migrationId: `${customerId}-mig`,
				customerId,
				filter: { customer: { plan: { plan_id: proTrial.id } } },
				operations: migrationOps({ proId: proTrial.id, addonId: addon.id }),
				noBillingChanges,
			});

			for (const entity of entities) {
				const entityCustomer = await autumnV1.entities.get<ApiEntityV0>(
					customerId,
					entity.id,
				);
				await expectCustomerProducts({
					customer: entityCustomer,
					active: [proTrial.id, addon.id],
				});
				await expectProductTrialing({
					customer: entityCustomer,
					productId: proTrial.id,
					trialEndsAt: trialEndsAt!,
				});
				await expectProductTrialing({
					customer: entityCustomer,
					productId: addon.id,
					trialEndsAt: trialEndsAt!,
				});
			}
			await expectTrialSubsPreserved({
				ctx,
				before: subSnapshots,
				expectUnchanged: noBillingChanges,
			});
		},
	);
}
