/// <reference types="bun" />

import { expect, test } from "bun:test";
import { readFile, writeFile } from "node:fs/promises";
import type { AttachParamsV1Input } from "@autumn/shared";
import chalk from "chalk";
import { ProductService } from "../../../../../server/src/internal/products/ProductService.js";
import { items } from "../../../../../server/tests/utils/fixtures/items.js";
import { products } from "../../../../../server/tests/utils/fixtures/products.js";
import { timeout } from "../../../../../server/tests/utils/genUtils.js";
import {
	initScenario,
	s,
} from "../../../../../server/tests/utils/testInitUtils/initScenario.js";
import {
	createCleanAtmnIntegrationContext,
	prepareAtmnIntegrationWorkspace,
	runAtmnWorkspaceCli,
} from "../utils/atmnTestWorkspace.js";

const customerId = "atmn-version-customer";
const planId = "atmn_version_pro";

const replaceFirst = ({
	from,
	search,
	value,
}: {
	from: string;
	search: RegExp | string;
	value: string;
}) => {
	const updated = from.replace(search, value);
	expect(updated).not.toBe(from);
	return updated;
};

const escapeRegExp = (value: string) =>
	value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const updatePulledPlanPrice = ({
	config,
	planId,
}: {
	config: string;
	planId: string;
}) =>
	replaceFirst({
		from: config,
		search: new RegExp(
			`(id:\\s*["']${escapeRegExp(planId)}["'][\\s\\S]*?price:\\s*\\{[\\s\\S]*?amount:\\s*)20(,)`,
		),
		value: "$125$2",
	});

const hasFixedPriceAmount = ({
	amount,
	full,
}: {
	amount: number;
	full: Awaited<ReturnType<typeof ProductService.getFull>>;
}) =>
	full.prices.some((price) => {
		const { config } = price;
		return "amount" in config && config.amount === amount;
	});

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

		const initialConfig = await readFile(workspace.configPath, "utf8");
		const updatedConfig = updatePulledPlanPrice({
			config: initialConfig,
			planId,
		});
		await writeFile(workspace.configPath, updatedConfig);

		await runAtmnWorkspaceCli({
			args: ["--yes"],
			command: "push",
			headless: true,
			workspace,
		});

		const latestPlan = await ProductService.getFull({
			db: ctx.db,
			env: ctx.env,
			idOrInternalId: planId,
			orgId: ctx.org.id,
		});

		expect(latestPlan.version).toBe(2);
		expect(hasFixedPriceAmount({ amount: 25, full: latestPlan })).toBe(true);
	},
);
