import { expect, test } from "bun:test";
import {
	type ApiPlanV1,
	ApiVersion,
	BillingInterval,
	BillingMethod,
	type CreatePlanParamsV2Input,
	TierBehavior,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { AutumnRpcCli } from "@/external/autumn/autumnRpcCli.js";
import { expectVolumeRenewalCorrect } from "./utils/volumeAdversarialUtils";

const autumnRpc = new AutumnRpcCli({ version: ApiVersion.V2_1 });
const getSuffix = () => Math.random().toString(36).slice(2, 9);

const createEurVolumePlan = async ({ planId }: { planId: string }) =>
	autumnRpc.plans.create<ApiPlanV1, CreatePlanParamsV2Input>({
		plan_id: planId,
		name: planId,
		group: `grp_${planId}`,
		auto_enable: false,
		price: {
			amount: 20,
			interval: BillingInterval.Month,
			additional_currencies: [{ currency: "eur", amount: 18 }],
		},
		items: [
			{
				feature_id: TestFeature.Messages,
				included: 100,
				price: {
					interval: BillingInterval.Month,
					billing_method: BillingMethod.UsageBased,
					tier_behavior: TierBehavior.VolumeBased,
					tiers: [
						{
							to: 500,
							amount: 0.1,
							additional_currencies: [{ currency: "eur", amount: 0.08 }],
						},
						{
							to: "inf",
							amount: 0.05,
							flat_amount: 25,
							additional_currencies: [
								{ currency: "eur", amount: 0.04, flat_amount: 20 },
							],
						},
					],
				},
			},
		],
	});

const runEurRenewal = async ({
	customerId,
	usage,
	expectedFeatureAmount,
	expectedTotal,
}: {
	customerId: string;
	usage: number;
	expectedFeatureAmount: number;
	expectedTotal: number;
}) => {
	const planId = `vol_adv_eur_${getSuffix()}`;
	await createEurVolumePlan({ planId });

	const scenario = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success", data: { currency: "eur" } }),
		],
		actions: [],
	});
	await scenario.autumnV1.billing.attach({
		customer_id: customerId,
		product_id: planId,
		redirect_mode: "if_required",
	});
	await scenario.autumnV1.track(
		{ customer_id: customerId, feature_id: TestFeature.Messages, value: usage },
		{ timeout: 3000 },
	);

	const { renewalInvoice } = await expectVolumeRenewalCorrect({
		scenario,
		expectedFeatureAmount,
	});
	expect(renewalInvoice.total).toBeCloseTo(expectedTotal, 2);

	const stripeInvoice = await scenario.ctx.stripeCli.invoices.retrieve(
		renewalInvoice.stripe_id,
	);
	expect(stripeInvoice.currency).toBe("eur");
};

test.concurrent(
	`${chalk.yellowBright("volume-currency 1: EUR customer, 300 used → 200 overage in band 101-600 at €0.08: €16")}`,
	async () => {
		await runEurRenewal({
			customerId: "vol-adv-eur-band1",
			usage: 300,
			expectedFeatureAmount: 16,
			expectedTotal: 34,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("volume-currency 2: EUR customer, 700 used → 600 overage in band 601+ at €0.04 + €20 flat: €44")}`,
	async () => {
		await runEurRenewal({
			customerId: "vol-adv-eur-band2",
			usage: 700,
			expectedFeatureAmount: 44,
			expectedTotal: 62,
		});
	},
);
