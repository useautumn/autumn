/** License attach and quantity changes emit activated/updated parent-plan webhooks. */

import { afterAll, beforeAll, expect, test } from "bun:test";
import type {
	BillingChangeResponse,
	CustomerPlanChange,
	AttachParamsV1Input,
	PlanChangeAction,
	UpdateSubscriptionV1ParamsInput,
} from "@autumn/shared";
import { expectStripeSubscriptionCorrect } from "@tests/integration/billing/utils/expectStripeSubCorrect/expectStripeSubscriptionCorrect";
import { createExternalStripeSubscription } from "@tests/integration/billing/stripe-webhooks/utils/sharedStripeProductAutoSyncUtils";
import { getBaseStripePriceId } from "@tests/integration/billing/sync/utils/syncProductHelpers";
import {
	getTestSvixAppId,
	setupWebhookTest,
	type WebhookTestSetup,
	waitForWebhook,
} from "@tests/integration/utils/svixWebhookTestUtils";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import ctx from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { ProductService } from "@/internal/products/ProductService";

type BillingUpdatedPayload = {
	type: string;
	data: BillingChangeResponse;
};

const findPlanChange = ({
	planChanges,
	planId,
	action,
}: {
	planChanges: CustomerPlanChange[];
	planId: string;
	action: PlanChangeAction;
}) =>
	planChanges.find(
		(change) =>
			change.action === action && change.subscription?.plan_id === planId,
	);

const waitForPlanChange = async ({
	customerId,
	planId,
	action,
}: {
	customerId: string;
	planId: string;
	action: PlanChangeAction;
}) =>
	waitForWebhook<BillingUpdatedPayload>({
		token: webhook.playToken,
		predicate: (payload) =>
			payload.type === "billing.updated" &&
			payload.data?.customer_id === customerId &&
			Boolean(
				findPlanChange({
					planChanges: payload.data?.plan_changes ?? [],
					planId,
					action,
				}),
			),
		timeoutMs: 20_000,
	});

const expectGenericUpdatedPlan = ({
	payload,
	planId,
}: {
	payload: BillingUpdatedPayload;
	planId: string;
}) => {
	const updated = findPlanChange({
		planChanges: payload.data.plan_changes,
		planId,
		action: "updated",
	});
	expect(updated).toMatchObject({
		action: "updated",
		subscription: {
			plan_id: planId,
			status: "active",
			past_due: false,
		},
		previous_attributes: {},
		item_changes: [],
	});
};

const expectActivatedPlan = ({
	payload,
	planId,
}: {
	payload: BillingUpdatedPayload;
	planId: string;
}) => {
	const activated = findPlanChange({
		planChanges: payload.data.plan_changes,
		planId,
		action: "activated",
	});
	expect(activated).toMatchObject({
		action: "activated",
		subscription: {
			plan_id: planId,
			status: "active",
			past_due: false,
		},
		previous_attributes: null,
		item_changes: [],
	});
};

let webhook: WebhookTestSetup;

beforeAll(async () => {
	webhook = await setupWebhookTest({
		appId: getTestSvixAppId({ svixConfig: ctx.org.svix_config }),
		filterTypes: ["billing.updated"],
	});
});

afterAll(async () => {
	await webhook?.cleanup();
});

const setupLicenseCatalog = async ({
	customerId,
	idPrefix,
}: {
	customerId: string;
	idPrefix: string;
}) => {
	const pro = products.base({
		id: `${idPrefix}-pro`,
		items: [items.dashboard()],
	});
	const developerSeat = products.base({
		id: `${idPrefix}-developer-seat`,
		group: `${idPrefix}-license-plans`,
		items: [
			items.monthlyPrice({ price: 20 }),
			items.monthlyMessages({ includedUsage: 500 }),
		],
	});

	const scenario = await initScenario({
		customerId,
		ctx,
		setup: [
			s.customer({ paymentMethod: "success", skipWebhooks: true }),
			s.products({ list: [pro, developerSeat] }),
		],
		actions: [
			s.licenses.link({
				parentProductId: pro.id,
				licenseProductId: developerSeat.id,
				included: 1,
			}),
		],
	});

	return { ...scenario, pro, developerSeat };
};

const setupLicenseSubscription = async ({
	customerId,
	idPrefix,
}: {
	customerId: string;
	idPrefix: string;
}) => {
	const { pro, developerSeat } = await setupLicenseCatalog({
		customerId,
		idPrefix,
	});

	const developerSeatFull = await ProductService.getFull({
		db: ctx.db,
		idOrInternalId: developerSeat.id,
		orgId: ctx.org.id,
		env: ctx.env,
	});
	const stripeSubscription = await createExternalStripeSubscription({
		ctx,
		customerId,
		items: [
			{
				price: getBaseStripePriceId({ fullProduct: developerSeatFull }),
				quantity: 1,
			},
		],
	});
	expect(stripeSubscription.status).toBe("active");
	const seatItem = stripeSubscription.items.data.find(
		(item) =>
			item.price.id ===
			getBaseStripePriceId({ fullProduct: developerSeatFull }),
	);
	if (!seatItem) throw new Error("Developer seat subscription item not found");

	return { pro, stripeSubscription, seatItem };
};

test.concurrent(
	`${chalk.yellowBright("billing.updated licenses: subscription.created activates Pro")}`,
	async () => {
		const customerId = "billing-updated-license-created";
		const { pro } = await setupLicenseSubscription({
			customerId,
			idPrefix: "billing-updated-license-created",
		});

		const result = await waitForWebhook<BillingUpdatedPayload>({
			token: webhook.playToken,
			predicate: (payload) =>
				payload.type === "billing.updated" &&
				payload.data?.customer_id === customerId &&
				Boolean(
					findPlanChange({
						planChanges: payload.data?.plan_changes ?? [],
						planId: pro.id,
						action: "activated",
					}),
				),
			timeoutMs: 20_000,
		});

		expect(result).not.toBeNull();
		expect(result?.payload.data.object).toBe("billing.updated");
		expectActivatedPlan({ payload: result!.payload, planId: pro.id });
	},
);

test.concurrent(
	`${chalk.yellowBright("billing.updated licenses: Stripe quantity update reports updated Pro")}`,
	async () => {
		const customerId = "billing-updated-license-quantity";
		const { pro, stripeSubscription, seatItem } =
			await setupLicenseSubscription({
				customerId,
				idPrefix: "billing-updated-license-quantity",
			});

		const activatedResult = await waitForWebhook<BillingUpdatedPayload>({
			token: webhook.playToken,
			predicate: (payload) =>
				payload.data?.customer_id === customerId &&
				Boolean(
					findPlanChange({
						planChanges: payload.data?.plan_changes ?? [],
						planId: pro.id,
						action: "activated",
					}),
				),
			timeoutMs: 20_000,
		});
		expect(activatedResult).not.toBeNull();

		const updatedSubscription = await ctx.stripeCli.subscriptions.update(
			stripeSubscription.id,
			{
				items: [{ id: seatItem.id, quantity: 3 }],
				proration_behavior: "none",
			},
		);
		expect(
			updatedSubscription.items.data.find((item) => item.id === seatItem.id)
				?.quantity,
		).toBe(3);

		const result = await waitForPlanChange({
			customerId,
			planId: pro.id,
			action: "updated",
		});

		expect(result).not.toBeNull();
		expect(result?.payload).toMatchObject({
			type: "billing.updated",
			data: {
				object: "billing.updated",
				customer_id: customerId,
				tags: ["sync:customer.subscription.updated"],
			},
		});
		expectGenericUpdatedPlan({
			payload: result!.payload,
			planId: pro.id,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("billing.updated licenses: billing.attach with licenses activates Pro")}`,
	async () => {
		const customerId = "billing-updated-license-attach";
		const { autumnV2_3, pro, developerSeat } = await setupLicenseCatalog({
			customerId,
			idPrefix: "billing-updated-license-attach",
		});

		await autumnV2_3.billing.attach<AttachParamsV1Input>({
			customer_id: customerId,
			plan_id: pro.id,
			redirect_mode: "if_required",
			license_quantities: [{ license_plan_id: developerSeat.id, quantity: 3 }],
		});
		await expectStripeSubscriptionCorrect({ ctx, customerId });

		const result = await waitForPlanChange({
			customerId,
			planId: pro.id,
			action: "activated",
		});
		expect(result).not.toBeNull();
		expect(result?.payload.data.tags).toEqual([]);
		expectActivatedPlan({ payload: result!.payload, planId: pro.id });
	},
);

test.concurrent(
	`${chalk.yellowBright("billing.updated licenses: attach then quantity update reports updated Pro")}`,
	async () => {
		const customerId = "billing-updated-license-attach-update";
		const { autumnV2_3, pro, developerSeat } = await setupLicenseCatalog({
			customerId,
			idPrefix: "billing-updated-license-attach-update",
		});

		await autumnV2_3.billing.attach<AttachParamsV1Input>({
			customer_id: customerId,
			plan_id: pro.id,
			redirect_mode: "if_required",
			license_quantities: [{ license_plan_id: developerSeat.id, quantity: 2 }],
		});
		await expectStripeSubscriptionCorrect({ ctx, customerId });

		const activatedResult = await waitForPlanChange({
			customerId,
			planId: pro.id,
			action: "activated",
		});
		expect(activatedResult).not.toBeNull();

		await autumnV2_3.billing.update<UpdateSubscriptionV1ParamsInput>({
			customer_id: customerId,
			plan_id: pro.id,
			license_quantities: [{ license_plan_id: developerSeat.id, quantity: 4 }],
		});
		await expectStripeSubscriptionCorrect({ ctx, customerId });

		const result = await waitForPlanChange({
			customerId,
			planId: pro.id,
			action: "updated",
		});
		expect(result).not.toBeNull();
		expect(result?.payload.data.tags).toEqual([]);
		expectGenericUpdatedPlan({
			payload: result!.payload,
			planId: pro.id,
		});
	},
);
