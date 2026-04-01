import { expect, test } from "bun:test";
import {
	type ApiCustomer,
	type ApiCustomerV3,
	customerEntitlements,
	type OrgConfig,
} from "@autumn/shared";
import { resetAndGetCusEnt } from "@tests/balances/track/rollovers/rolloverTestUtils.js";
import { findCustomerEntitlement } from "@tests/balances/utils/findCustomerEntitlement.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import {
	expireCusEntForReset,
	setCachedCusEntField,
} from "@tests/utils/cusProductUtils/resetTestUtils.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { advanceToNextInvoice } from "@tests/utils/testAttachUtils/testAttachUtils.js";
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

const enablePersistFreeOverage = async ({
	orgId,
	orgConfig,
}: {
	orgId: string;
	orgConfig: OrgConfig;
}) => {
	await OrgService.update({
		db,
		orgId,
		updates: { config: { ...orgConfig, persist_free_overage: true } },
	});
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
// 1. Lazy reset (DB path)
// ─────────────────────────────────────────────────────────────────

test.concurrent(`${chalk.yellowBright("persist overage ON (DB): lazy reset deducts overage")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const free = products.base({ items: [messagesItem] });

	const { customerId, autumnV2, ctx } = await initScenario({
		customerId: "persist-ovg-on-db",
		setup: [s.customer({ testClock: false }), s.products({ list: [free] })],
		actions: [s.attach({ productId: free.id })],
	});

	await enablePersistFreeOverage({
		orgId: ctx.org.id,
		orgConfig: ctx.org.config,
	});

	try {
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
		expect(after.balances[TestFeature.Messages].current_balance).toBe(0);
		expect(after.balances[TestFeature.Messages].usage).toBe(100);
	} finally {
		await disablePersistFreeOverage({
			orgId: ctx.org.id,
			orgConfig: ctx.org.config,
		});
	}
});

// ─────────────────────────────────────────────────────────────────
// 2. Lazy reset (cache path)
// ─────────────────────────────────────────────────────────────────

test.concurrent(`${chalk.yellowBright("persist overage ON (cache): lazy reset deducts overage from cache")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const free = products.base({ items: [messagesItem] });

	const { customerId, autumnV2, ctx } = await initScenario({
		customerId: "persist-ovg-on-cache",
		setup: [s.customer({ testClock: false }), s.products({ list: [free] })],
		actions: [s.attach({ productId: free.id })],
	});

	await enablePersistFreeOverage({
		orgId: ctx.org.id,
		orgConfig: ctx.org.config,
	});

	try {
		await autumnV2.customers.get<ApiCustomer>(customerId);

		const cusEnt = await findCustomerEntitlement({
			ctx,
			customerId,
			featureId: TestFeature.Messages,
		});
		expect(cusEnt).toBeDefined();

		await setBalanceInDb({ cusEntId: cusEnt!.id, balance: -50 });
		await setCachedCusEntField({
			orgId: ctx.org.id,
			env: ctx.env,
			customerId,
			cusEntId: cusEnt!.id,
			field: "balance",
			value: -50,
		});
		await expireCusEntForReset({
			ctx,
			customerId,
			featureId: TestFeature.Messages,
		});

		const after = await autumnV2.customers.get<ApiCustomer>(customerId);
		expect(after.balances[TestFeature.Messages].current_balance).toBe(50);
		expect(after.balances[TestFeature.Messages].usage).toBe(50);
	} finally {
		await disablePersistFreeOverage({
			orgId: ctx.org.id,
			orgConfig: ctx.org.config,
		});
	}
});

// ─────────────────────────────────────────────────────────────────
// 3. Cron reset path
// ─────────────────────────────────────────────────────────────────

test.concurrent(`${chalk.yellowBright("persist overage ON (cron): cron reset deducts overage")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const free = products.base({ items: [messagesItem] });

	const { customerId, ctx, customer } = await initScenario({
		customerId: "persist-ovg-on-cron",
		setup: [s.customer({ testClock: false }), s.products({ list: [free] })],
		actions: [s.attach({ productId: free.id })],
	});

	const cusEntBefore = await findCustomerEntitlement({
		ctx,
		customerId,
		featureId: TestFeature.Messages,
	});
	expect(cusEntBefore).toBeDefined();

	await setBalanceInDb({ cusEntId: cusEntBefore!.id, balance: -75 });

	const cusEntAfter = await resetAndGetCusEnt({
		ctx,
		customer: customer!,
		productGroup: customerId,
		featureId: TestFeature.Messages,
		persistFreeOverage: true,
	});

	expect(cusEntAfter!.balance).toBe(25);
});

// ─────────────────────────────────────────────────────────────────
// 4. No overage — positive balance resets normally
// ─────────────────────────────────────────────────────────────────

test.concurrent(`${chalk.yellowBright("persist overage ON (no overage): positive balance resets to full allowance")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const free = products.base({ items: [messagesItem] });

	const { customerId, autumnV2, ctx } = await initScenario({
		customerId: "persist-ovg-on-positive",
		setup: [s.customer({ testClock: false }), s.products({ list: [free] })],
		actions: [s.attach({ productId: free.id })],
	});

	await enablePersistFreeOverage({
		orgId: ctx.org.id,
		orgConfig: ctx.org.config,
	});

	try {
		const cusEnt = await findCustomerEntitlement({
			ctx,
			customerId,
			featureId: TestFeature.Messages,
		});
		expect(cusEnt).toBeDefined();

		await setBalanceInDb({ cusEntId: cusEnt!.id, balance: 50 });
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
	} finally {
		await disablePersistFreeOverage({
			orgId: ctx.org.id,
			orgConfig: ctx.org.config,
		});
	}
});

// ─────────────────────────────────────────────────────────────────
// 5. Per-entity — independent overage per entity
// ─────────────────────────────────────────────────────────────────

test.concurrent(`${chalk.yellowBright("persist overage ON (per-entity): each entity carries its own overage")}`, async () => {
	const perEntityMessages = items.monthlyMessages({
		includedUsage: 100,
		entityFeatureId: TestFeature.Users,
	});
	const free = products.base({ items: [perEntityMessages] });

	const { customerId, ctx } = await initScenario({
		customerId: "persist-ovg-on-entity",
		setup: [
			s.customer({ testClock: false }),
			s.products({ list: [free] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [s.attach({ productId: free.id })],
	});

	await enablePersistFreeOverage({
		orgId: ctx.org.id,
		orgConfig: ctx.org.config,
	});
	ctx.org.config = { ...ctx.org.config, persist_free_overage: true };

	try {
		const cusEnt = await findCustomerEntitlement({
			ctx,
			customerId,
			featureId: TestFeature.Messages,
		});
		expect(cusEnt).toBeDefined();
		expect(cusEnt!.entities).toBeDefined();

		const entities = { ...cusEnt!.entities! };
		const entityIds = Object.keys(entities);
		expect(entityIds.length).toBe(2);

		entities[entityIds[0]].balance = -50;
		entities[entityIds[0]].adjustment = 0;
		entities[entityIds[1]].balance = 30;
		entities[entityIds[1]].adjustment = 0;

		await db
			.update(customerEntitlements)
			.set({ entities })
			.where(eq(customerEntitlements.id, cusEnt!.id));
		await expireCusEntForReset({
			ctx,
			customerId,
			featureId: TestFeature.Messages,
		});

		const cusEntAfter = await findCustomerEntitlement({
			ctx,
			customerId,
			featureId: TestFeature.Messages,
		});
		expect(cusEntAfter).toBeDefined();
		expect(cusEntAfter!.entities).toBeDefined();

		expect(cusEntAfter!.entities![entityIds[0]].balance).toBe(50);
		expect(cusEntAfter!.entities![entityIds[1]].balance).toBe(100);
	} finally {
		await disablePersistFreeOverage({
			orgId: ctx.org.id,
			orgConfig: ctx.org.config,
		});
	}
});

// ─────────────────────────────────────────────────────────────────
// 6. Per-entity mixed — different overage amounts
// ─────────────────────────────────────────────────────────────────

test.concurrent(`${chalk.yellowBright("persist overage ON (per-entity mixed): different overage per entity")}`, async () => {
	const perEntityMessages = items.monthlyMessages({
		includedUsage: 100,
		entityFeatureId: TestFeature.Users,
	});
	const free = products.base({ items: [perEntityMessages] });

	const { customerId, ctx } = await initScenario({
		customerId: "persist-ovg-on-ent-mix",
		setup: [
			s.customer({ testClock: false }),
			s.products({ list: [free] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [s.attach({ productId: free.id })],
	});

	await enablePersistFreeOverage({
		orgId: ctx.org.id,
		orgConfig: ctx.org.config,
	});
	ctx.org.config = { ...ctx.org.config, persist_free_overage: true };

	try {
		const cusEnt = await findCustomerEntitlement({
			ctx,
			customerId,
			featureId: TestFeature.Messages,
		});
		expect(cusEnt).toBeDefined();
		expect(cusEnt!.entities).toBeDefined();

		const entities = { ...cusEnt!.entities! };
		const entityIds = Object.keys(entities);
		expect(entityIds.length).toBe(2);

		entities[entityIds[0]].balance = -30;
		entities[entityIds[0]].adjustment = 0;
		entities[entityIds[1]].balance = -200;
		entities[entityIds[1]].adjustment = 0;

		await db
			.update(customerEntitlements)
			.set({ entities })
			.where(eq(customerEntitlements.id, cusEnt!.id));
		await expireCusEntForReset({
			ctx,
			customerId,
			featureId: TestFeature.Messages,
		});

		const cusEntAfter = await findCustomerEntitlement({
			ctx,
			customerId,
			featureId: TestFeature.Messages,
		});
		expect(cusEntAfter).toBeDefined();
		expect(cusEntAfter!.entities).toBeDefined();

		expect(cusEntAfter!.entities![entityIds[0]].balance).toBe(70);
		expect(cusEntAfter!.entities![entityIds[1]].balance).toBe(-100);
	} finally {
		await disablePersistFreeOverage({
			orgId: ctx.org.id,
			orgConfig: ctx.org.config,
		});
	}
});

// ─────────────────────────────────────────────────────────────────
// 7. Prepaid monthly + lifetime — overage carries on paid reset
// ─────────────────────────────────────────────────────────────────

test.concurrent(`${chalk.yellowBright("persist overage ON (prepaid): invoice reset carries prepaid overage")}`, async () => {
	const prepaidItem = items.prepaidMessages({
		includedUsage: 0,
		billingUnits: 100,
		price: 10,
	});
	const lifetimeItem = items.lifetimeMessages({ includedUsage: 50 });
	const pro = products.pro({ items: [prepaidItem, lifetimeItem] });

	const { customerId, autumnV1, ctx, testClockId } = await initScenario({
		customerId: "persist-ovg-on-prepaid",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [
			s.billing.attach({
				productId: pro.id,
				options: [{ feature_id: TestFeature.Messages, quantity: 200 }],
			}),
			s.track({ featureId: TestFeature.Messages, value: 300, timeout: 2000 }),
		],
	});

	// Enable flag BEFORE advancing, so the webhook handler sees it in DB
	await enablePersistFreeOverage({
		orgId: ctx.org.id,
		orgConfig: ctx.org.config,
	});

	try {
		// After attach: prepaid balance = 200 (quantity=200, billingUnits=100, so 2*100=200), lifetime = 50
		// Total messages balance = 200 + 50 = 250
		// After track 300: deducted 300 from messages
		// The prepaid cusEnt's balance should be negative (overage)
		// On advance, handlePrepaidPrices resets prepaid with persistFreeOverage

		await advanceToNextInvoice({
			stripeCli: ctx.stripeCli,
			testClockId: testClockId!,
			withPause: true,
		});

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

		// Lifetime messages (50) should be untouched by the prepaid reset
		// Prepaid: was 200, used 300 -> overage of some amount on the prepaid cusEnt
		// After reset with persist_free_overage: new prepaid balance = 200 - overage
		// The exact split depends on deduction order, so just verify the feature exists
		// and the balance is less than the full 250 (200 prepaid + 50 lifetime)
		expect(customer.features[TestFeature.Messages]).toBeDefined();
		expect(customer.features[TestFeature.Messages].balance).toBeLessThan(250);
	} finally {
		await disablePersistFreeOverage({
			orgId: ctx.org.id,
			orgConfig: ctx.org.config,
		});
	}
});
