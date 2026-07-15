import { expect, test } from "bun:test";
import {
	type ApiPlanV1,
	ApiVersion,
	BillingInterval,
	BillingMethod,
	type CreatePlanParamsV2Input,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { AutumnRpcCli } from "@/external/autumn/autumnRpcCli.js";

const autumnRpc = new AutumnRpcCli({ version: ApiVersion.V2_1 });
const getSuffix = () => Math.random().toString(36).slice(2, 9);

// A prepaid quantity DECREASE must credit at the eur pack price — exercising the
// refund/credit line-item currency resolution deterministically (no async
// Stripe refund, which is flaky and skipped suite-wide).
test.concurrent(
	`${chalk.yellowBright("multi-currency e2e: eur prepaid decrease credits in eur")}`,
	async () => {
		const billingUnits = 12;
		const usdPerPack = 8;
		const eurPerPack = 7;
		const planId = `mc_credit_${getSuffix()}`;

		await autumnRpc.plans.create<ApiPlanV1, CreatePlanParamsV2Input>({
			plan_id: planId,
			name: "MC Credit Plan",
			auto_enable: false,
			price: {
				amount: 20,
				interval: BillingInterval.Month,
				additional_currencies: [{ currency: "eur", amount: 18 }],
			},
			items: [
				{
					feature_id: TestFeature.Messages,
					included: 0,
					price: {
						amount: usdPerPack,
						interval: BillingInterval.Month,
						billing_method: BillingMethod.Prepaid,
						billing_units: billingUnits,
						additional_currencies: [{ currency: "eur", amount: eurPerPack }],
					},
				},
			],
		});

		const { customerId, autumnV1 } = await initScenario({
			customerId: "mc-credit-eur",
			setup: [
				s.customer({ paymentMethod: "success", data: { currency: "eur" } }),
			],
			actions: [],
		});

		await autumnV1.billing.attach({
			customer_id: customerId,
			product_id: planId,
			redirect_mode: "if_required",
			options: [
				{ feature_id: TestFeature.Messages, quantity: 20 * billingUnits },
			],
		});

		// Decrease 20 → 10 packs: credit is -10 packs at the eur price (7), not usd (8).
		const preview = await autumnV1.subscriptions.previewUpdate({
			customer_id: customerId,
			product_id: planId,
			options: [
				{ feature_id: TestFeature.Messages, quantity: 10 * billingUnits },
			],
		});
		expect(preview.total).toBe(-10 * eurPerPack);
	},
);
