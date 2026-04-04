import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import defaultCtx from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { db } from "@/db/initDrizzle";
import { CusService } from "@/internal/customers/CusService";
import { OrgService } from "@/internal/orgs/OrgService";

const retrieveStripeCustomer = async ({
	stripeCustomerId,
}: {
	stripeCustomerId: string;
}) => {
	const stripeCustomer =
		await defaultCtx.stripeCli.customers.retrieve(stripeCustomerId);
	if ("deleted" in stripeCustomer) throw new Error("Stripe customer deleted");
	return stripeCustomer;
};

describe("forward_customer_metadata", () => {
	beforeAll(async () => {
		await OrgService.update({
			db,
			orgId: defaultCtx.org.id,
			updates: {
				config: {
					...defaultCtx.org.config,
					forward_customer_metadata: true,
				},
			},
		});
	});

	afterAll(async () => {
		await OrgService.update({
			db,
			orgId: defaultCtx.org.id,
			updates: {
				config: {
					...defaultCtx.org.config,
					forward_customer_metadata: false,
				},
			},
		});
	});

	// ═══════════════════════════════════════════════════════════════════
	// CREATE: metadata forwarded when Stripe customer created via attach
	// ═══════════════════════════════════════════════════════════════════

	test.concurrent(`${chalk.yellowBright("create: metadata forwarded to Stripe via attach (handleAttachV2)")}`, async () => {
		const customerId = "create-fwd-meta-attach";
		const messagesItem = items.monthlyMessages({ includedUsage: 100 });
		const pro = products.pro({ id: "pro-fwd-meta", items: [messagesItem] });

		const { autumnV1, ctx } = await initScenario({
			setup: [s.deleteCustomer({ customerId }), s.products({ list: [pro] })],
			actions: [],
		});

		await autumnV1.customers.create({
			id: customerId,
			name: "Metadata Forward Test",
			email: `${customerId}@example.com`,
			metadata: { plan: "enterprise", team_size: "50" },
		});

		await autumnV1.billing.attach({
			customer_id: customerId,
			product_id: pro.id,
		});

		const fullCustomer = await CusService.getFull({
			ctx,
			idOrInternalId: customerId,
		});
		const stripeCustomerId = fullCustomer.processor?.id;
		expect(stripeCustomerId).toBeDefined();

		const stripeCustomer = await retrieveStripeCustomer({
			stripeCustomerId: stripeCustomerId!,
		});

		expect(stripeCustomer.metadata.plan).toBe("enterprise");
		expect(stripeCustomer.metadata.team_size).toBe("50");
		expect(stripeCustomer.metadata.autumn_id).toBe(customerId);
		expect(stripeCustomer.metadata.autumn_internal_id).toBeDefined();
	});

	test.concurrent(`${chalk.yellowBright("create: autumn_ prefix keys are not forwarded to Stripe")}`, async () => {
		const customerId = "create-fwd-meta-filter";
		const messagesItem = items.monthlyMessages({ includedUsage: 100 });
		const pro = products.pro({ id: "pro-fwd-filter", items: [messagesItem] });

		const { autumnV1, ctx } = await initScenario({
			setup: [s.deleteCustomer({ customerId }), s.products({ list: [pro] })],
			actions: [],
		});

		await autumnV1.customers.create({
			id: customerId,
			name: "Metadata Filter Test",
			email: `${customerId}@example.com`,
			metadata: {
				valid_key: "should_appear",
				autumn_custom: "should_not_appear",
			},
		});

		await autumnV1.billing.attach({
			customer_id: customerId,
			product_id: pro.id,
		});

		const fullCustomer = await CusService.getFull({
			ctx,
			idOrInternalId: customerId,
		});
		const stripeCustomerId = fullCustomer.processor?.id;
		expect(stripeCustomerId).toBeDefined();

		const stripeCustomer = await retrieveStripeCustomer({
			stripeCustomerId: stripeCustomerId!,
		});

		expect(stripeCustomer.metadata.valid_key).toBe("should_appear");
		expect(stripeCustomer.metadata.autumn_custom).toBeUndefined();
		expect(stripeCustomer.metadata.autumn_id).toBe(customerId);
	});

	test.concurrent(`${chalk.yellowBright("create: non-string metadata values stringified for Stripe")}`, async () => {
		const customerId = "create-fwd-meta-types";
		const messagesItem = items.monthlyMessages({ includedUsage: 100 });
		const pro = products.pro({ id: "pro-fwd-types", items: [messagesItem] });

		const { autumnV1, ctx } = await initScenario({
			setup: [s.deleteCustomer({ customerId }), s.products({ list: [pro] })],
			actions: [],
		});

		await autumnV1.customers.create({
			id: customerId,
			name: "Type Coercion Test",
			email: `${customerId}@example.com`,
			metadata: {
				string_val: "hello",
				number_val: 42,
				bool_val: true,
				object_val: { nested: "data" },
			},
		});

		await autumnV1.billing.attach({
			customer_id: customerId,
			product_id: pro.id,
		});

		const fullCustomer = await CusService.getFull({
			ctx,
			idOrInternalId: customerId,
		});
		const stripeCustomerId = fullCustomer.processor?.id;
		expect(stripeCustomerId).toBeDefined();

		const stripeCustomer = await retrieveStripeCustomer({
			stripeCustomerId: stripeCustomerId!,
		});

		expect(stripeCustomer.metadata.string_val).toBe("hello");
		expect(stripeCustomer.metadata.number_val).toBe("42");
		expect(stripeCustomer.metadata.bool_val).toBe("true");
		expect(stripeCustomer.metadata.object_val).toBe('{"nested":"data"}');
	});

	// ═══════════════════════════════════════════════════════════════════
	// UPDATE: metadata forwarded to existing Stripe customer
	// ═══════════════════════════════════════════════════════════════════

	test.concurrent(`${chalk.yellowBright("update: metadata forwarded to Stripe")}`, async () => {
		const customerId = "update-fwd-meta";
		const messagesItem = items.monthlyMessages({ includedUsage: 100 });
		const pro = products.pro({ id: "pro-upd-fwd", items: [messagesItem] });

		const { autumnV1, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [s.attach({ productId: pro.id })],
		});

		await autumnV1.customers.update(customerId, {
			metadata: { plan: "enterprise", team_size: "25" },
		});

		const fullCustomer = await CusService.getFull({
			ctx,
			idOrInternalId: customerId,
		});
		const stripeCustomerId = fullCustomer.processor?.id;
		expect(stripeCustomerId).toBeDefined();

		const stripeCustomer = await retrieveStripeCustomer({
			stripeCustomerId: stripeCustomerId!,
		});

		expect(stripeCustomer.metadata.plan).toBe("enterprise");
		expect(stripeCustomer.metadata.team_size).toBe("25");
	});

	test.concurrent(`${chalk.yellowBright("update: delete metadata key removes from Stripe")}`, async () => {
		const customerId = "update-del-meta-key";
		const messagesItem = items.monthlyMessages({ includedUsage: 100 });
		const pro = products.pro({ id: "pro-upd-del", items: [messagesItem] });

		const { autumnV1, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [s.attach({ productId: pro.id })],
		});

		await autumnV1.customers.update(customerId, {
			metadata: { keep_me: "value", delete_me: "gone_soon" },
		});

		const fullCustomer = await CusService.getFull({
			ctx,
			idOrInternalId: customerId,
		});
		const stripeCustomerId = fullCustomer.processor?.id;
		expect(stripeCustomerId).toBeDefined();

		let stripeCustomer = await retrieveStripeCustomer({
			stripeCustomerId: stripeCustomerId!,
		});
		expect(stripeCustomer.metadata.keep_me).toBe("value");
		expect(stripeCustomer.metadata.delete_me).toBe("gone_soon");

		await autumnV1.customers.update(customerId, {
			metadata: { delete_me: null } as Record<string, unknown>,
		});

		stripeCustomer = await retrieveStripeCustomer({
			stripeCustomerId: stripeCustomerId!,
		});
		expect(stripeCustomer.metadata.keep_me).toBe("value");
		expect("delete_me" in stripeCustomer.metadata).toBe(false);
	});

	test.concurrent(`${chalk.yellowBright("update: autumn_ prefix keys not forwarded on update")}`, async () => {
		const customerId = "update-fwd-meta-filter";
		const messagesItem = items.monthlyMessages({ includedUsage: 100 });
		const pro = products.pro({
			id: "pro-upd-fwd-filter",
			items: [messagesItem],
		});

		const { autumnV1, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [s.attach({ productId: pro.id })],
		});

		await autumnV1.customers.update(customerId, {
			metadata: {
				valid_key: "forwarded",
				autumn_reserved: "should_not_appear",
			},
		});

		const fullCustomer = await CusService.getFull({
			ctx,
			idOrInternalId: customerId,
		});
		const stripeCustomerId = fullCustomer.processor?.id;
		expect(stripeCustomerId).toBeDefined();

		const stripeCustomer = await retrieveStripeCustomer({
			stripeCustomerId: stripeCustomerId!,
		});

		expect(stripeCustomer.metadata.valid_key).toBe("forwarded");
		expect(stripeCustomer.metadata.autumn_reserved).toBeUndefined();
	});
});
