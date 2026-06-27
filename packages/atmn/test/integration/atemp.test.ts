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

const customerId = "atmn_version_customer";
const planId = "atmn_version_pro";

test.concurrent(
	`${chalk.yellowBright("atmn versioning: pushing an attached pro plan update creates v2")}`,
	async () => {
		const pro = products.pro({
			id: planId,
			items: [items.monthlyMessages({ includedUsage: 1000 })],
		});
		const ctx = await createCleanAtmnIntegrationContext();

		const { autumnV2_2 } = await initScenario({
			ctx,
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro], prefix: "" }),
			],
			actions: [],
		});

		await autumnV2_2.billing.attach<AttachParamsV1Input>({
			customer_id: customerId,
			plan_id: pro.id,
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
