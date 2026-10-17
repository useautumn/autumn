import { expect, test } from "bun:test";
import {
	ApiVersion,
	type AttachParamsV1Input,
	type UpdateSubscriptionV1ParamsInput,
} from "@autumn/shared";
import { expectFactsMatchPreview } from "@tests/integration/approvals/utils/expectFactsMatchPreview";
import { permissionFactsClient } from "@tests/integration/approvals/utils/permissionFactsClient";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

/** Facts about where a change lands and who it's for: entity, cycle anchor, past payments, tax. */

test.concurrent(
	`${chalk.yellowBright("context facts 1: an entity attach names the entity's feature; a customer attach has none")}`,
	async () => {
		const customerId = "approvals-facts-entity";
		const pro = products.pro({
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const { entities } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
				s.entities({ count: 1, featureId: TestFeature.Users }),
			],
			actions: [],
		});
		const client = permissionFactsClient();

		const onEntity = await client.billing.previewAttach({
			customer_id: customerId,
			entity_id: entities[0].id,
			plan_id: pro.id,
		});
		expect(onEntity._permission_facts.entity).toEqual({
			feature_id: TestFeature.Users,
		});

		const onCustomer = await client.billing.previewAttach({
			customer_id: customerId,
			plan_id: pro.id,
		});
		expect(onCustomer._permission_facts.entity).toBeNull();
	},
);

test.concurrent(
	`${chalk.yellowBright("context facts 1b: a multi-attach gives each plan its own facts, on its own entity")}`,
	async () => {
		const customerId = "approvals-facts-multi-attach-entity";
		const messages = items.monthlyMessages({ includedUsage: 100 });
		const pro = products.pro({ items: [messages] });
		const addon = products.recurringAddOn({ id: "addon", items: [messages] });
		const { entities } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, addon] }),
				s.entities({ count: 1, featureId: TestFeature.Users }),
			],
			actions: [],
		});

		// Only the first plan names an entity; the second stays customer-level.
		const { _permission_facts: facts } = await permissionFactsClient({
			version: ApiVersion.V2_2,
		}).billing.previewMultiAttach({
			customer_id: customerId,
			plans: [
				{ plan_id: addon.id, entity_id: entities[0].id },
				{ plan_id: pro.id },
			],
		});

		const scopes = facts.map(
			({
				entity,
				incoming,
			}: {
				entity: unknown;
				incoming: { plan_id: string }[];
			}) => ({ entity, plans: incoming.map(({ plan_id }) => plan_id) }),
		);
		expect(scopes).toEqual(
			expect.arrayContaining([
				{ entity: { feature_id: TestFeature.Users }, plans: [addon.id] },
				{ entity: null, plans: [pro.id] },
			]),
		);
		expect(scopes).toHaveLength(2);
	},
);

test.concurrent(
	`${chalk.yellowBright("context facts 2: has_paid is true once a positive invoice is paid, false before")}`,
	async () => {
		const customerId = "approvals-facts-has-paid";
		const pro = products.pro({
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const premium = products.premium({
			items: [items.monthlyMessages({ includedUsage: 500 })],
		});
		const { autumnV2_1 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, premium] }),
			],
			actions: [],
		});
		const client = permissionFactsClient();
		const params: AttachParamsV1Input = {
			customer_id: customerId,
			plan_id: pro.id,
		};

		const before = await client.billing.previewAttach(params);
		expect(before._permission_facts.customer).toEqual({
			id: customerId,
			has_paid: false,
		});

		await autumnV2_1.billing.attach(params);
		const after = await client.billing.previewAttach({
			customer_id: customerId,
			plan_id: premium.id,
		});
		expect(after._permission_facts.customer.has_paid).toBe(true);
	},
);

test.concurrent(
	`${chalk.yellowBright("context facts 3: an update that resets the cycle carries billing_cycle_anchor now; a plain update is unchanged")}`,
	async () => {
		const customerId = "approvals-facts-cycle-anchor";
		const pro = products.pro({
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const premium = products.premium({
			items: [items.monthlyMessages({ includedUsage: 500 })],
		});
		await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, premium] }),
			],
			actions: [s.attach({ productId: pro.id })],
		});
		const client = permissionFactsClient();

		const reset = await client.billing.previewAttach({
			customer_id: customerId,
			plan_id: premium.id,
			billing_cycle_anchor: "now",
		});
		expect(reset._permission_facts.billing_cycle_anchor).toBe("now");

		const plain: UpdateSubscriptionV1ParamsInput = {
			customer_id: customerId,
			plan_id: pro.id,
			feature_quantities: [],
		};
		const update = await client.subscriptions.previewUpdate(plain);
		expect(update._permission_facts.billing_cycle_anchor).toBe("unchanged");
	},
);

test.concurrent(
	`${chalk.yellowBright("context facts 4: a manual tax rate is in the facts' total, exactly as the preview shows it")}`,
	async () => {
		const customerId = "approvals-facts-tax";
		const pro = products.pro({
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const { ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [],
		});
		const taxRate = await ctx.stripeCli.taxRates.create({
			display_name: "Approvals facts tax",
			percentage: 20,
			inclusive: false,
		});

		const preview = await permissionFactsClient().billing.previewAttach({
			customer_id: customerId,
			plan_id: pro.id,
			tax_rate_id: taxRate.id,
		});
		expect(preview.total).toBe(24);
		expectFactsMatchPreview({ facts: preview._permission_facts, preview });
	},
);
