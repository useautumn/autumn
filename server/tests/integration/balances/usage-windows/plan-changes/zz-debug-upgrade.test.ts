import { test } from "bun:test";
import { type ApiCustomerV5, ApiVersion } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import { sql } from "drizzle-orm";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { flushBalanceWorkerCustomer } from "@/internal/balances/balanceWorker/flushBalanceWorkerCustomer.js";
import { setCustomerUsageLimit } from "../../utils/usage-limit-utils/customerUsageLimitUtils.js";

const autumnV2_3 = new AutumnInt({ version: ApiVersion.V2_3 });
// biome-ignore lint/suspicious/noExplicitAny: debug
const rowsOf = (r: any) => (Array.isArray(r) ? r : (r?.rows ?? []));

// biome-ignore lint/suspicious/noExplicitAny: debug
const dump = async ({ ctx, customerId, label }: { ctx: any; customerId: string; label: string }) => {
	await flushBalanceWorkerCustomer({ ctx, customerId });
	const windows = rowsOf(await ctx.db.execute(sql`
		SELECT uw.id, uw.feature_id, uw.usage, uw.window_start_at, uw.window_end_at, uw.anchor_customer_entitlement_id
		FROM usage_windows uw JOIN customers c ON c.internal_id = uw.internal_customer_id
		WHERE c.id = ${customerId} AND c.org_id = ${ctx.org.id} AND c.env = ${ctx.env}`));
	const ents = rowsOf(await ctx.db.execute(sql`
		SELECT ce.id, ce.balance, ce.next_reset_at, ce.created_at, ce.customer_product_id, cp.status, cp.product_id, f.id as feature
		FROM customer_entitlements ce JOIN customers c ON c.internal_id = ce.internal_customer_id
		LEFT JOIN customer_products cp ON cp.id = ce.customer_product_id
		JOIN entitlements e ON e.id = ce.entitlement_id JOIN features f ON f.internal_id = e.internal_feature_id
		WHERE c.id = ${customerId} AND c.org_id = ${ctx.org.id} AND c.env = ${ctx.env}`));
	const customer = await autumnV2_3.customers.get<ApiCustomerV5>(customerId);
	console.log(`DEBUGUW ${label} ${JSON.stringify({ windows, ents, limits: (customer as unknown as { billing_controls?: unknown }).billing_controls, balances: customer.balances })}`);
};

test("debug upgrade2 at cap", async () => {
	const pro = products.pro({ id: "pro", items: [items.monthlyMessages({ includedUsage: 100 })] });
	const premium = products.premium({ id: "premium", items: [items.monthlyMessages({ includedUsage: 200 })] });
	const customerId = "uw-dbg-atcap";
	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [s.customer({ paymentMethod: "success", testClock: false }), s.products({ list: [pro, premium] })],
		actions: [s.billing.attach({ productId: pro.id })],
	});
	await setCustomerUsageLimit({ autumn: autumnV2_3, customerId, featureId: TestFeature.Messages, limit: 5 });
	await autumnV2_3.track({ customer_id: customerId, feature_id: TestFeature.Messages, value: 5 });
	await autumnV2_3.track({ customer_id: customerId, feature_id: TestFeature.Messages, value: 1 });
	await dump({ ctx, customerId, label: "u2-before" });
	await autumnV1.billing.attach({ customer_id: customerId, product_id: premium.id, redirect_mode: "if_required" });
	await dump({ ctx, customerId, label: "u2-after-attach" });
	await autumnV2_3.track({ customer_id: customerId, feature_id: TestFeature.Messages, value: 5 });
	await dump({ ctx, customerId, label: "u2-after-track" });
});

test("debug upgrade3 credits", async () => {
	const pro = products.pro({ id: "pro", items: [items.monthlyCredits({ includedUsage: 3 })] });
	const premium = products.premium({ id: "premium", items: [items.monthlyCredits({ includedUsage: 100 })] });
	const customerId = "uw-dbg-credits";
	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [s.customer({ paymentMethod: "success", testClock: false }), s.products({ list: [pro, premium] })],
		actions: [s.billing.attach({ productId: pro.id })],
	});
	await autumnV2_3.post("/balances.create", { customer_id: customerId, feature_id: TestFeature.Credits, included_grant: 50 });
	await setCustomerUsageLimit({ autumn: autumnV2_3, customerId, featureId: TestFeature.Credits, limit: 5 });
	await autumnV2_3.track({ customer_id: customerId, feature_id: TestFeature.Credits, value: 5 });
	await dump({ ctx, customerId, label: "u3-before" });
	await autumnV1.billing.attach({ customer_id: customerId, product_id: premium.id, redirect_mode: "if_required" });
	await dump({ ctx, customerId, label: "u3-after-attach" });
});
