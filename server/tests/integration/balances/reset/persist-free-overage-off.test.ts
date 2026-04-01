import { expect, test } from "bun:test";
import {
	type ApiCustomer,
	customerEntitlements,
	type OrgConfig,
} from "@autumn/shared";
import { findCustomerEntitlement } from "@tests/balances/utils/findCustomerEntitlement.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { expireCusEntForReset } from "@tests/utils/cusProductUtils/resetTestUtils.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { eq } from "drizzle-orm";
import { db } from "@/db/initDrizzle.js";
import { OrgService } from "@/internal/orgs/OrgService.js";

const setBalanceInDb = async ({
	cusEntId,
	balance,
}: {
	cusEntId: string;
	balance: number;
}) => {
	await db
		.update(customerEntitlements)
		.set({ balance })
		.where(eq(customerEntitlements.id, cusEntId));
};

const disablePersistFreeOverage = async ({
	orgId,
	orgConfig,
}: {
	orgId: string;
	orgConfig: OrgConfig;
}) => {
	await OrgService.update({
		db,
		orgId,
		updates: { config: { ...orgConfig, persist_free_overage: false } },
	});
};

// ─────────────────────────────────────────────────────────────────
// 1. Flag off — negative balance resets to full allowance
// ─────────────────────────────────────────────────────────────────

test.concurrent(`${chalk.yellowBright("persist overage OFF: resets to full allowance when disabled")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const free = products.base({ items: [messagesItem] });

	const { customerId, autumnV2, ctx } = await initScenario({
		customerId: "persist-ovg-off-basic",
		setup: [s.customer({ testClock: false }), s.products({ list: [free] })],
		actions: [s.attach({ productId: free.id })],
	});

	await disablePersistFreeOverage({
		orgId: ctx.org.id,
		orgConfig: ctx.org.config,
	});

	const cusEnt = await findCustomerEntitlement({
		ctx,
		customerId,
		featureId: TestFeature.Messages,
	});
	expect(cusEnt).toBeDefined();

	await setBalanceInDb({ cusEntId: cusEnt!.id, balance: -100 });
	await expireCusEntForReset({
		ctx,
		customerId,
		featureId: TestFeature.Messages,
	});

	const after = await autumnV2.customers.get<ApiCustomer>(customerId, {
		skip_cache: "true",
	});

	expect(after.balances[TestFeature.Messages].current_balance).toBe(100);
	expect(after.balances[TestFeature.Messages].usage).toBe(0);
});
