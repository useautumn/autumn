/** Dropped license assignments follow their parent's lifecycle during sync.
 * They need not be explicitly released for entities to lose access. */
import { expect, test } from "bun:test";
import type { ApiCustomerV5, ApiEntityV2 } from "@autumn/shared";
import { getBaseStripePriceId } from "@tests/integration/billing/sync/utils/syncProductHelpers";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { listLicenseAssignments } from "@tests/integration/licenses/licenseTestUtils";
import { expectCustomerLicenses } from "@tests/integration/licenses/utils/expectCustomerLicenses";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import ctx from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import type Stripe from "stripe";
import { billingActions } from "@/internal/billing/v2/actions";
import { subscriptionToSyncParams } from "@/internal/billing/v2/actions/sync/subscriptionToSyncParams";
import { CusService } from "@/internal/customers/CusService";
import { ProductService } from "@/internal/products/ProductService";

const ASSIGNED_SEATS = 2;

const setupTeamWithAssignedSeats = async ({
	customerId,
}: {
	customerId: string;
}) => {
	const group = `${customerId}-plans`;
	const team = products.base({
		id: `${customerId}-team`,
		group,
		items: [items.monthlyPrice({ price: 100 }), items.dashboard()],
	});
	const pro = products.base({
		id: `${customerId}-pro`,
		group,
		items: [items.monthlyPrice({ price: 20 }), items.dashboard()],
	});
	const teamSeat = products.base({
		id: `${customerId}-team-seat`,
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});
	const scenario = await initScenario({
		customerId,
		ctx,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.entities({ count: ASSIGNED_SEATS, featureId: TestFeature.Users }),
			s.products({ list: [team, pro, teamSeat] }),
		],
		actions: [
			s.licenses.link({
				parentProductId: team.id,
				licenseProductId: teamSeat.id,
				included: ASSIGNED_SEATS,
			}),
			s.billing.attach({ productId: team.id }),
			s.licenses.assign({
				licenseProductId: teamSeat.id,
				entityIndexes: [0, 1],
			}),
		],
	});

	const fullCustomer = await CusService.getFull({
		ctx,
		idOrInternalId: customerId,
	});
	const teamCustomerProduct = fullCustomer.customer_products.find(
		(customerProduct) => customerProduct.product.id === team.id,
	);
	const subscriptionId = teamCustomerProduct?.subscription_ids?.[0];
	if (!subscriptionId) throw new Error("Expected a Team subscription");

	const fullPro = await ProductService.getFull({
		db: ctx.db,
		idOrInternalId: pro.id,
		orgId: ctx.org.id,
		env: ctx.env,
	});

	return {
		...scenario,
		team,
		pro,
		teamSeat,
		fullCustomer,
		subscriptionId,
		proStripePriceId: getBaseStripePriceId({ fullProduct: fullPro }),
	};
};

const syncSubscription = async ({
	customerId,
	subscription,
}: {
	customerId: string;
	subscription: Stripe.Subscription;
}) => {
	const { params } = await subscriptionToSyncParams({
		ctx,
		customerId,
		subscription,
	});
	await billingActions.syncV2({ ctx, params });
};

const expectProWithoutTeamSeats = async ({
	autumnV2_3,
	customerId,
	entityIds,
	teamId,
	proId,
	teamSeatId,
	expectAssignmentsReleased = false,
}: {
	autumnV2_3: Awaited<ReturnType<typeof initScenario>>["autumnV2_3"];
	customerId: string;
	entityIds: string[];
	teamId: string;
	proId: string;
	teamSeatId: string;
	expectAssignmentsReleased?: boolean;
}) => {
	const customer = await autumnV2_3.customers.get<ApiCustomerV5>(customerId);
	await expectCustomerProducts({
		customer,
		active: [proId],
		notPresent: [teamId],
	});
	expectCustomerLicenses({ customer, count: 0, licenses: [] });

	for (const entityId of entityIds) {
		const entity = await autumnV2_3.entities.get<ApiEntityV2>(
			customerId,
			entityId,
		);
		await expectCustomerProducts({
			customer: entity,
			notPresent: [teamSeatId],
		});
	}
	if (expectAssignmentsReleased) {
		expect(
			await listLicenseAssignments({
				autumn: autumnV2_3,
				customerId,
				active: true,
			}),
		).toHaveLength(0);
	}
};

test(`${chalk.yellowBright("billing.sync: Team to Pro expires inherited license seats")}`, async () => {
	const customerId = "sync-team-to-pro-license-inheritance";
	const scenario = await setupTeamWithAssignedSeats({ customerId });
	const subscription = await ctx.stripeCli.subscriptions.retrieve(
		scenario.subscriptionId,
	);
	const subscriptionItem = subscription.items.data[0];
	if (!subscriptionItem) throw new Error("Expected a subscription item");

	const updatedSubscription = await ctx.stripeCli.subscriptions.update(
		subscription.id,
		{
			items: [
				{
					id: subscriptionItem.id,
					price: scenario.proStripePriceId,
				},
			],
			proration_behavior: "none",
		},
	);
	await syncSubscription({ customerId, subscription: updatedSubscription });

	await expectProWithoutTeamSeats({
		autumnV2_3: scenario.autumnV2_3,
		customerId,
		entityIds: scenario.entities.map((entity) => entity.id),
		teamId: scenario.team.id,
		proId: scenario.pro.id,
		teamSeatId: scenario.teamSeat.id,
		expectAssignmentsReleased: true,
	});
});

test(`${chalk.yellowBright("billing.sync: expired Team permits Pro on a new subscription")}`, async () => {
	const customerId = "sync-expired-team-to-pro-license-inheritance";
	const scenario = await setupTeamWithAssignedSeats({ customerId });
	await scenario.autumnV2_3.billing.update({
		customer_id: customerId,
		plan_id: scenario.team.id,
		cancel_action: "cancel_immediately",
	});

	const stripeCustomerId = scenario.fullCustomer.processor?.id;
	if (!stripeCustomerId) throw new Error("Expected a Stripe customer");
	const proSubscription = await ctx.stripeCli.subscriptions.create({
		customer: stripeCustomerId,
		items: [{ price: scenario.proStripePriceId }],
	});
	await syncSubscription({ customerId, subscription: proSubscription });

	await expectProWithoutTeamSeats({
		autumnV2_3: scenario.autumnV2_3,
		customerId,
		entityIds: scenario.entities.map((entity) => entity.id),
		teamId: scenario.team.id,
		proId: scenario.pro.id,
		teamSeatId: scenario.teamSeat.id,
	});
});
