import { expect, test } from "bun:test";
import {
	type ApiCustomerV3,
	type ApiPlanV1,
	ApiVersion,
	BillingInterval,
	type CreatePlanParamsV2Input,
} from "@autumn/shared";
import { runUpdatePlanMigration } from "@tests/integration/billing/migrations-v2/utils/runUpdatePlanMigration";
import { expectProductActive } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { AutumnRpcCli } from "@/external/autumn/autumnRpcCli.js";

const autumnRpc = new AutumnRpcCli({ version: ApiVersion.V2_1 });
const getSuffix = () => Math.random().toString(36).slice(2, 9);

// Migrating a locked-eur customer to a new plan version must keep the
// subscription in eur and re-point it at the v2 eur price (migrations create no
// new charge, so this verifies the currency-aware v2 price is used).
//
// Uses migrations V2 (`/v1/migrations.*`) — legacy `POST /v1/migrations` was
// removed, and unmatched `/v1` paths fall through to the session-authed root
// router ("Unauthorized - no session found").
test.concurrent(
	`${chalk.yellowBright("multi-currency e2e: migration keeps the subscription in eur on the v2 price")}`,
	async () => {
		const planId = `mc_migrate_${getSuffix()}`;
		await autumnRpc.plans.create<ApiPlanV1, CreatePlanParamsV2Input>({
			plan_id: planId,
			name: "MC Migrate Plan",
			auto_enable: false,
			price: {
				amount: 20,
				interval: BillingInterval.Month,
				additional_currencies: [{ currency: "eur", amount: 18 }],
			},
		});

		const { customerId, autumnV1, autumnV2_2, ctx } = await initScenario({
			customerId: "mc-migrate-eur",
			setup: [
				s.customer({ paymentMethod: "success", data: { currency: "eur" } }),
			],
			actions: [],
		});

		await autumnV1.billing.attach({
			customer_id: customerId,
			product_id: planId,
			redirect_mode: "if_required",
		});

		// New version with a different eur amount.
		await autumnRpc.plans.update<ApiPlanV1, CreatePlanParamsV2Input>(planId, {
			plan_id: planId,
			name: "MC Migrate Plan",
			auto_enable: false,
			price: {
				amount: 30,
				interval: BillingInterval.Month,
				additional_currencies: [{ currency: "eur", amount: 27 }],
			},
		});

		await runUpdatePlanMigration({
			ctx,
			migrationClient: autumnV2_2,
			migrationId: `${customerId}-mc-migrate`,
			customerId,
			filter: { customer: { plan: { plan_id: planId } } },
			operations: {
				customer: [
					{
						type: "update_plan",
						plan_filter: { plan_id: planId },
						version: 2,
					},
				],
			},
			waitFor: async () => {
				const customer =
					await autumnV1.customers.get<ApiCustomerV3>(customerId);
				const product = customer.products?.find((p) => p.id === planId);
				expect(product?.version).toBe(2);
			},
		});

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectProductActive({ customer, productId: planId });

		// Subscription stays eur and re-points at the v2 eur price (2700), no usd.
		const subs = await ctx.stripeCli.subscriptions.list({
			customer: customer.stripe_id as string,
		});
		expect(subs.data.length).toBeGreaterThanOrEqual(1);
		for (const sub of subs.data) {
			expect(sub.currency).toBe("eur");
			for (const item of sub.items.data) {
				expect(item.price.currency).toBe("eur");
			}
		}
		const hasV2Price = subs.data.some((sub) =>
			sub.items.data.some((item) => item.price.unit_amount === 2700),
		);
		expect(hasV2Price).toBe(true);
	},
);
