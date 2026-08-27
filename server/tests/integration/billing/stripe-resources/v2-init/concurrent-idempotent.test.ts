/**
 * Concurrent V2 attach of the same unminted plan must initialise one Stripe
 * price id — not one per customer.
 *
 * Contract (fixed / consumable / allocatedV2 / prepaidV2):
 *   product has no stripe price ids
 *   two customers attach the same plan at the same time
 *   Autumn stores one slot id
 *   both Stripe subscriptions use that id
 *
 * Red (before):  two attaches minted two Stripe Prices (consumable also raced
 *                the meter). Last write won on the Autumn row.
 * Green (after): Stripe idempotency keys on product / price / meter create —
 *                both attaches get the same Stripe id.
 */

import { test } from "bun:test";
import type { AttachParamsV1Input } from "@autumn/shared";
import {
	expectSingleStripePriceInitialized,
	expectV2StripeSlotsCorrect,
	priceForV2SlotKind,
	type V2StripeSlotKind,
} from "@tests/integration/billing/stripe-resources/v2-init/utils/expectV2StripeSlotsCorrect.js";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { ProductService } from "@/internal/products/ProductService.js";

const attachSamePlanConcurrently = async ({
	customerId,
	otherCustomerId,
	product,
	kind,
	featureId,
	featureQuantities,
}: {
	customerId: string;
	otherCustomerId: string;
	product: ReturnType<typeof products.base> | ReturnType<typeof products.pro>;
	kind: V2StripeSlotKind;
	featureId?: string;
	featureQuantities?: AttachParamsV1Input["feature_quantities"];
}) => {
	const { autumnV2_3, ctx, customer, otherCustomers } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.otherCustomers([{ id: otherCustomerId, paymentMethod: "success" }]),
			s.products({ list: [product], createInStripe: false }),
		],
		actions: [],
	});

	const attachBody = (id: string): AttachParamsV1Input => ({
		customer_id: id,
		plan_id: product.id,
		redirect_mode: "if_required",
		...(featureQuantities ? { feature_quantities: featureQuantities } : {}),
	});

	await Promise.all([
		autumnV2_3.billing.attach<AttachParamsV1Input>(attachBody(customerId)),
		autumnV2_3.billing.attach<AttachParamsV1Input>(
			attachBody(otherCustomerId),
		),
	]);

	await Promise.all([
		expectCustomerProducts({
			customerId,
			autumn: autumnV2_3,
			active: [product.id],
		}),
		expectCustomerProducts({
			customerId: otherCustomerId,
			autumn: autumnV2_3,
			active: [product.id],
		}),
	]);

	const fullProduct = await ProductService.getFull({
		db: ctx.db,
		idOrInternalId: product.id,
		orgId: ctx.org.id,
		env: ctx.env,
	});
	const price = priceForV2SlotKind({
		product: fullProduct,
		kind,
		featureId,
	});

	expectV2StripeSlotsCorrect({ price, kind, label: customerId });

	const otherStripeCustomerId = otherCustomers.get(otherCustomerId)?.customer
		.processor?.id;
	await expectSingleStripePriceInitialized({
		price,
		kind,
		stripeCli: ctx.stripeCli,
		stripeCustomerIds: [
			customer?.processor?.id,
			otherStripeCustomerId,
		].filter((id): id is string => Boolean(id)),
		label: customerId,
	});
};

test.concurrent(
	`${chalk.yellowBright("stripe-resources idempotent: concurrent fixed attach mints one price")}`,
	async () => {
		const plan = products.pro({ id: "fixed", items: [] });
		await attachSamePlanConcurrently({
			customerId: "sr-idemp-fixed2",
			otherCustomerId: "sr-idemp-fixed2-b",
			product: plan,
			kind: "fixed",
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("stripe-resources idempotent: concurrent prepaid attach mints one price")}`,
	async () => {
		const plan = products.base({
			id: "prepaid",
			items: [items.prepaidMessages()],
		});
		await attachSamePlanConcurrently({
			customerId: "sr-idemp-prepaid2",
			otherCustomerId: "sr-idemp-prepaid2-b",
			product: plan,
			kind: "prepaid",
			featureId: TestFeature.Messages,
			featureQuantities: [
				{ feature_id: TestFeature.Messages, quantity: 100 },
			],
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("stripe-resources idempotent: concurrent consumable attach mints one price")}`,
	async () => {
		const plan = products.base({
			id: "cons",
			items: [items.consumableMessages()],
		});
		await attachSamePlanConcurrently({
			customerId: "sr-idemp-cons2",
			otherCustomerId: "sr-idemp-cons2-b",
			product: plan,
			kind: "consumable",
			featureId: TestFeature.Messages,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("stripe-resources idempotent: concurrent allocated attach mints one price")}`,
	async () => {
		const plan = products.base({
			id: "alloc",
			items: [items.allocatedUsers()],
		});
		await attachSamePlanConcurrently({
			customerId: "sr-idemp-alloc2",
			otherCustomerId: "sr-idemp-alloc2-b",
			product: plan,
			kind: "allocated",
			featureId: TestFeature.Users,
		});
	},
);
