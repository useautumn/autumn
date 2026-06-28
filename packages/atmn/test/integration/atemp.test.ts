import { test } from "bun:test";
import type { AttachParamsV1Input } from "@autumn/shared";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { timeout } from "@tests/utils/genUtils.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import {
	createCleanAtmnIntegrationContext,
	prepareAtmnIntegrationWorkspace,
	runAtmnWorkspaceCli,
} from "./utils/atmnTestWorkspace.js";

const proCustomerId = "atmn_pro_customer";
const premiumCustomerId = "atmn_premium_customer";
const proPlanId = "atmn_pro";
const premiumPlanId = "atmn_premium";

test.concurrent(
	`${chalk.yellowBright("atmn scratch: pulls pro and premium with one customer each")}`,
	async () => {
		const pro = products.pro({
			id: proPlanId,
			items: [items.monthlyMessages({ includedUsage: 1000 })],
		});
		const premium = products.premium({
			id: premiumPlanId,
			items: [items.monthlyMessages({ includedUsage: 5000 })],
		});
		const ctx = await createCleanAtmnIntegrationContext();

		const { autumnV2_2 } = await initScenario({
			ctx,
			customerId: proCustomerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, premium], prefix: "" }),
			],
			actions: [],
		});

		await autumnV2_2.customers.create({
			id: premiumCustomerId,
			name: "Atmn Premium Customer",
		});

		await autumnV2_2.billing.attach<AttachParamsV1Input>({
			customer_id: proCustomerId,
			plan_id: pro.id,
		});
		await autumnV2_2.billing.attach<AttachParamsV1Input>({
			customer_id: premiumCustomerId,
			plan_id: premium.id,
		});
		await timeout(5000);

		const workspace = await prepareAtmnIntegrationWorkspace({
			secretKey: ctx.orgSecretKey,
		});

		await runAtmnWorkspaceCli({
			args: ["--force", "--no-declaration-file"],
			command: "pull",
			headless: true,
			workspace,
		});
	},
);
