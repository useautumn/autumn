/**
 * V2 attach mints only the Stripe slots each price kind needs.
 *
 * Contract:
 *   fixed      → stripe_price_id
 *   prepaid    → stripe_prepaid_price_v2_id (no v1 stripe_price_id)
 *   consumable → stripe_price_id + stripe_meter_id
 *   allocated  → stripe_price_id (V2 path: no placeholder / meter)
 *                 uses allocatedUsers (InArrearProrated), not allocatedV2Users
 *                 (Arrear behavior classifies as consumable and mints a meter)
 *
 * Leftover empty + placeholder stay unset on every kind.
 * stripe_product_id is not asserted — that slot is changing.
 */

import { test } from "bun:test";
import type { AttachParamsV1Input } from "@autumn/shared";
import {
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

const attachUnmintedPlan = async ({
	customerId,
	product,
	kind,
	featureId,
	featureQuantities,
}: {
	customerId: string;
	product: ReturnType<typeof products.base> | ReturnType<typeof products.pro>;
	kind: V2StripeSlotKind;
	featureId?: string;
	featureQuantities?: AttachParamsV1Input["feature_quantities"];
}) => {
	const { autumnV2_3, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [product], createInStripe: false }),
		],
		actions: [],
	});

	await autumnV2_3.billing.attach<AttachParamsV1Input>({
		customer_id: customerId,
		plan_id: product.id,
		redirect_mode: "if_required",
		...(featureQuantities ? { feature_quantities: featureQuantities } : {}),
	});

	await expectCustomerProducts({
		customerId,
		autumn: autumnV2_3,
		active: [product.id],
	});

	const fullProduct = await ProductService.getFull({
		db: ctx.db,
		idOrInternalId: product.id,
		orgId: ctx.org.id,
		env: ctx.env,
	});

	expectV2StripeSlotsCorrect({
		price: priceForV2SlotKind({ product: fullProduct, kind, featureId }),
		kind,
		label: customerId,
	});
};

test.concurrent(
	`${chalk.yellowBright("stripe-resources v2 slots: fixed mints stripe_price_id only")}`,
	async () => {
		const plan = products.pro({ id: "fixed", items: [] });
		await attachUnmintedPlan({
			customerId: "sr-slots-fixed",
			product: plan,
			kind: "fixed",
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("stripe-resources v2 slots: prepaid mints prepaid_v2, not v1")}`,
	async () => {
		const plan = products.base({
			id: "prepaid",
			items: [items.prepaidMessages()],
		});
		await attachUnmintedPlan({
			customerId: "sr-slots-prepaid",
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
	`${chalk.yellowBright("stripe-resources v2 slots: consumable mints price + meter")}`,
	async () => {
		const plan = products.base({
			id: "cons",
			items: [items.consumableMessages()],
		});
		await attachUnmintedPlan({
			customerId: "sr-slots-cons",
			product: plan,
			kind: "consumable",
			featureId: TestFeature.Messages,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("stripe-resources v2 slots: allocated mints licensed price, no placeholder")}`,
	async () => {
		const plan = products.base({
			id: "alloc-prorated",
			items: [items.allocatedUsers()],
		});
		await attachUnmintedPlan({
			customerId: "sr-slots-alloc2",
			product: plan,
			kind: "allocated",
			featureId: TestFeature.Users,
		});
	},
);
