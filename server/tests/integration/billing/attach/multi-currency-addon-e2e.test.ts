import { expect, test } from "bun:test";
import {
	type ApiCustomerV3,
	type ApiPlanV1,
	ApiVersion,
	BillingInterval,
	type CreatePlanParamsV2Input,
} from "@autumn/shared";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { AutumnRpcCli } from "@/external/autumn/autumnRpcCli.js";

const autumnRpc = new AutumnRpcCli({ version: ApiVersion.V2_1 });
const getSuffix = () => Math.random().toString(36).slice(2, 9);

const makePlan = ({
	planId,
	usd,
	eur,
	addOn = false,
}: {
	planId: string;
	usd: number;
	eur: number;
	addOn?: boolean;
}) =>
	autumnRpc.plans.create<ApiPlanV1, CreatePlanParamsV2Input>({
		plan_id: planId,
		name: planId,
		auto_enable: false,
		add_on: addOn,
		price: {
			amount: usd,
			interval: BillingInterval.Month,
			additional_currencies: [{ currency: "eur", amount: eur }],
		},
	});

// Attaching a recurring add-on to an eur-locked customer must bill the add-on
// at its eur price.
test.concurrent(
	`${chalk.yellowBright("multi-currency e2e: eur recurring add-on bills the eur price")}`,
	async () => {
		const suffix = getSuffix();
		const mainId = `mc_ao_main_${suffix}`;
		const addonId = `mc_ao_addon_${suffix}`;
		await makePlan({ planId: mainId, usd: 20, eur: 18 });
		await makePlan({ planId: addonId, usd: 10, eur: 9, addOn: true });

		const { customerId, autumnV1, ctx } = await initScenario({
			customerId: "mc-ao-eur",
			setup: [
				s.customer({ paymentMethod: "success", data: { currency: "eur" } }),
			],
			actions: [],
		});

		await autumnV1.billing.attach({
			customer_id: customerId,
			product_id: mainId,
			redirect_mode: "if_required",
		});

		await autumnV1.billing.attach({
			customer_id: customerId,
			product_id: addonId,
			redirect_mode: "if_required",
		});

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectCustomerProducts({ customer, active: [mainId, addonId] });

		// The add-on charge (latest invoice) must be the eur price (9), not usd (10).
		const stripeInvoices = await ctx.stripeCli.invoices.list({
			customer: customer.stripe_id as string,
		});
		const latestInvoice = stripeInvoices.data[0];
		expect(latestInvoice.currency).toBe("eur");
		expect(latestInvoice.total).toBe(9 * 100);

		const subs = await ctx.stripeCli.subscriptions.list({
			customer: customer.stripe_id as string,
		});
		for (const sub of subs.data) {
			expect(sub.currency).toBe("eur");
		}
	},
);
