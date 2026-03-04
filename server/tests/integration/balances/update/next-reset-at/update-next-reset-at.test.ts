import { expect, test } from "bun:test";
import type { ApiCustomer, CheckResponseV2 } from "@autumn/shared";
import { ms, ResetInterval } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

// ═══════════════════════════════════════════════════════════════════
// UPDATE-NEXT-RESET-AT-1: Basic next_reset_at update
// Updates next_reset_at without touching the balance
// ═══════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("update-next-reset-at-1: basic next_reset_at update")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const freeProd = products.base({ id: "free", items: [messagesItem] });

	const { customerId, autumnV2 } = await initScenario({
		customerId: "update-nra-1",
		setup: [s.customer({ testClock: false }), s.products({ list: [freeProd] })],
		actions: [s.attach({ productId: freeProd.id })],
	});

	// Get initial reset time
	const initialCheck = await autumnV2.check<CheckResponseV2>({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
	});
	const originalResetAt = initialCheck.balance?.reset?.resets_at ?? 0;
	expect(originalResetAt).toBeGreaterThan(Date.now());

	// Update next_reset_at to 7 days from now (without touching balance)
	const newResetAt = Date.now() + ms.days(7);
	await autumnV2.balances.update({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		next_reset_at: newResetAt,
	});

	// Balance should be unchanged
	const customer = await autumnV2.customers.get<ApiCustomer>(customerId);
	expect(customer.balances[TestFeature.Messages]).toMatchObject({
		granted_balance: 100,
		current_balance: 100,
		usage: 0,
	});

	// Reset time should be updated
	const check = await autumnV2.check<CheckResponseV2>({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
	});
	expect(check.balance?.reset?.resets_at).toBeCloseTo(newResetAt, -3);

	// Verify DB sync
	const customerFromDb = await autumnV2.customers.get<ApiCustomer>(customerId, {
		skip_cache: "true",
	});
	expect(customerFromDb.balances[TestFeature.Messages]).toMatchObject({
		granted_balance: 100,
		current_balance: 100,
		usage: 0,
	});
});

// ═══════════════════════════════════════════════════════════════════
// UPDATE-NEXT-RESET-AT-2: Targets earliest reset when multiple breakdowns
// With monthly + lifetime items, only the monthly cusEnt has next_reset_at.
// The sort picks the earliest (monthly), leaving lifetime unchanged.
// ═══════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("update-next-reset-at-2: targets earliest reset with multiple breakdowns")}`, async () => {
	const monthlyItem = items.monthlyMessages({ includedUsage: 100 });
	const lifetimeItem = items.lifetimeMessages({ includedUsage: 50 });
	const freeProd = products.base({
		id: "free",
		items: [monthlyItem, lifetimeItem],
	});

	const { customerId, autumnV2 } = await initScenario({
		customerId: "update-nra-2",
		setup: [s.customer({ testClock: false }), s.products({ list: [freeProd] })],
		actions: [s.attach({ productId: freeProd.id })],
	});

	// Get initial check to confirm both breakdowns exist
	const initialCheck = await autumnV2.check<CheckResponseV2>({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
	});
	expect(initialCheck.balance?.breakdown).toHaveLength(2);

	// Update next_reset_at — should target the monthly one (earliest)
	const newResetAt = Date.now() + ms.days(7);
	await autumnV2.balances.update({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		next_reset_at: newResetAt,
	});

	// Monthly breakdown should have updated reset
	const check = await autumnV2.check<CheckResponseV2>({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
	});

	const monthlyBreakdown = check.balance?.breakdown?.find(
		(b: { reset?: { interval?: string } | null }) =>
			b.reset?.interval === ResetInterval.Month,
	);
	expect(monthlyBreakdown?.reset?.resets_at).toBeCloseTo(newResetAt, -3);

	// Lifetime breakdown should have no reset (one-off)
	const lifetimeBreakdown = check.balance?.breakdown?.find(
		(b: { reset?: { interval?: string } | null }) =>
			b.reset?.interval === ResetInterval.OneOff,
	);
	expect(lifetimeBreakdown?.reset?.interval).toBe(ResetInterval.OneOff);
});

// ═══════════════════════════════════════════════════════════════════
// UPDATE-NEXT-RESET-AT-3: Filter by interval to target specific breakdown
// ═══════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("update-next-reset-at-3: filter by interval targets correct breakdown")}`, async () => {
	const monthlyItem = items.monthlyMessages({ includedUsage: 100 });
	const weeklyItem = items.weeklyMessages({ includedUsage: 50 });
	const freeProd = products.base({
		id: "free",
		items: [monthlyItem, weeklyItem],
	});

	const { customerId, autumnV2 } = await initScenario({
		customerId: "update-nra-3",
		setup: [s.customer({ testClock: false }), s.products({ list: [freeProd] })],
		actions: [s.attach({ productId: freeProd.id })],
	});

	// Get breakdowns — find the monthly cusEntId and weekly original reset
	const initialCheck = await autumnV2.check<CheckResponseV2>({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
	});
	expect(initialCheck.balance?.breakdown).toHaveLength(2);

	const monthlyBreakdownInitial = initialCheck.balance?.breakdown?.find(
		(b) => b.reset?.interval === ResetInterval.Month,
	);
	const weeklyBreakdownInitial = initialCheck.balance?.breakdown?.find(
		(b) => b.reset?.interval === ResetInterval.Week,
	);

	const monthlyCusEntId = monthlyBreakdownInitial?.id ?? "";
	const weeklyOriginalResetAt = weeklyBreakdownInitial?.reset?.resets_at ?? 0;
	expect(monthlyCusEntId).toBeTruthy();
	expect(weeklyOriginalResetAt).toBeGreaterThan(Date.now());

	// Update only the monthly breakdown via customer_entitlement_id filter
	const newResetAt = Date.now() + ms.days(14);
	await autumnV2.balances.update({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		next_reset_at: newResetAt,
		interval: ResetInterval.Month,
	});

	// Monthly reset should be updated, weekly should be unchanged
	const check = await autumnV2.check<CheckResponseV2>({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
	});

	const monthlyBreakdown = check.balance?.breakdown?.find(
		(b) => b.reset?.interval === ResetInterval.Month,
	);
	const weeklyBreakdown = check.balance?.breakdown?.find(
		(b) => b.reset?.interval === ResetInterval.Week,
	);

	expect(monthlyBreakdown?.reset?.resets_at).toBeCloseTo(newResetAt, -3);
	expect(weeklyBreakdown?.reset?.resets_at).toBeCloseTo(
		weeklyOriginalResetAt,
		-3,
	);

	// Total balance should be unchanged (100 monthly + 50 weekly)
	const customer = await autumnV2.customers.get<ApiCustomer>(customerId);
	expect(customer.balances[TestFeature.Messages]).toMatchObject({
		granted_balance: 150,
		current_balance: 150,
		usage: 0,
	});

	// Verify DB sync
	const customerFromDb = await autumnV2.customers.get<ApiCustomer>(customerId, {
		skip_cache: "true",
	});
	expect(customerFromDb.balances[TestFeature.Messages]).toMatchObject({
		granted_balance: 150,
		current_balance: 150,
		usage: 0,
	});
});
// ═══════════════════════════════════════════════════════════════════
// UPDATE-NEXT-RESET-AT-4: Cannot update next reset at for lifetime balance
// ═══════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("update-next-reset-at-4: cannot update next reset at for lifetime balance")}`, async () => {
	const monthlyItem = items.monthlyMessages({ includedUsage: 100 });
	const lifetimeItem = items.lifetimeMessages({ includedUsage: 50 });
	const freeProd = products.base({
		id: "free",
		items: [monthlyItem, lifetimeItem],
	});

	const { customerId, autumnV2 } = await initScenario({
		customerId: "update-nra-4",
		setup: [s.customer({ testClock: false }), s.products({ list: [freeProd] })],
		actions: [s.attach({ productId: freeProd.id })],
	});

	// Get the cusEntId from breakdown
	const initialCheck = await autumnV2.check<CheckResponseV2>({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
	});
	const cusEntId =
		initialCheck.balance?.breakdown?.find(
			(b) => b.reset?.interval === ResetInterval.OneOff,
		)?.id ?? "";
	expect(cusEntId).toBeTruthy();

	// Update via customer_entitlement_id filter
	const newResetAt = Date.now() + ms.days(14);
	await expectAutumnError({
		func: async () => {
			await autumnV2.balances.update({
				customer_id: customerId,
				feature_id: TestFeature.Messages,
				next_reset_at: newResetAt,
				customer_entitlement_id: cusEntId,
			});
		},
	});
});
