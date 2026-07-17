// TDD contract: quarterly Pro has 3 paid seats, 0 included, and 2 assignments.
// Its annual upgrade keeps both entities on one annual pool sharing the Stripe product.
import { expect, test } from "bun:test";
import {
	type ApiCustomerV5,
	ApiVersion,
	type AttachParamsV1Input,
	BillingInterval,
} from "@autumn/shared";
import {
	getBaseStripePriceId,
	getProductStripeProductId,
} from "@tests/integration/billing/sync/utils/syncProductHelpers";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectStripeSubscriptionCorrect } from "@tests/integration/billing/utils/expectStripeSubCorrect";
import { createVariantPlan } from "@tests/integration/crud/plans/variants/utils/variantTestPlanUtils";
import { listLicenseAssignments } from "@tests/integration/licenses/licenseTestUtils";
import { expectCustomerLicenses } from "@tests/integration/licenses/utils/expectCustomerLicenses";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { AutumnRpcCli } from "@/external/autumn/autumnRpcCli";
import { constructPriceItem } from "@/internal/products/product-items/productItemUtils";
import { ProductService } from "@/internal/products/ProductService";

const SEAT_QUANTITY = 3;
const INCLUDED_SEATS = 0;

test(`${chalk.yellowBright("license attach immediate switch: quarterly Pro upgrades to annual with annual seats")}`, async () => {
	const customerId = "license-attach-immediate-switch-variants";
	const quarterlyPro = products.base({
		id: "license-switch-pro-quarterly",
		items: [items.dashboard()],
	});
	const quarterlySeat = products.base({
		id: "license-switch-dev-seat-quarterly",
		group: "license-switch-dev-seat-variants",
		items: [
			constructPriceItem({
				price: 20,
				interval: BillingInterval.Quarter,
			}),
			items.monthlyMessages({ includedUsage: 500 }),
		],
	});

	const { ctx, entities, autumnV2_3 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success", testClock: false }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
			s.products({ list: [quarterlyPro, quarterlySeat] }),
		],
		actions: [],
	});
	const rpc = new AutumnRpcCli({
		secretKey: ctx.orgSecretKey,
		version: ApiVersion.V2_1,
	});
	const annualProId = `${quarterlyPro.id}-annual`;
	const annualSeatId = `${quarterlySeat.id}-annual`;

	await createVariantPlan({
		rpc,
		basePlanId: quarterlyPro.id,
		variantPlanId: annualProId,
		name: "Pro Annual",
	});
	await createVariantPlan({
		rpc,
		basePlanId: quarterlySeat.id,
		variantPlanId: annualSeatId,
		name: "Pro Annual Dev Seat",
	});
	await rpc.post("/plans.update", {
		plan_id: annualSeatId,
		price: { amount: 200, interval: BillingInterval.Year },
		disable_version: true,
	});
	await rpc.post("/plans.update", {
		plan_id: quarterlyPro.id,
		licenses: [
			{ license_plan_id: quarterlySeat.id, included: INCLUDED_SEATS },
		],
	});
	await rpc.post("/plans.update", {
		plan_id: annualProId,
		licenses: [{ license_plan_id: annualSeatId, included: INCLUDED_SEATS }],
	});

	const quarterlySeatFull = await ProductService.getFull({
		db: ctx.db,
		idOrInternalId: quarterlySeat.id,
		orgId: ctx.org.id,
		env: ctx.env,
	});
	const annualSeatFull = await ProductService.getFull({
		db: ctx.db,
		idOrInternalId: annualSeatId,
		orgId: ctx.org.id,
		env: ctx.env,
	});
	expect(
		getProductStripeProductId({ fullProduct: annualSeatFull }),
	).toBe(getProductStripeProductId({ fullProduct: quarterlySeatFull }));
	expect(getBaseStripePriceId({ fullProduct: annualSeatFull })).not.toBe(
		getBaseStripePriceId({ fullProduct: quarterlySeatFull }),
	);

	await autumnV2_3.billing.attach<AttachParamsV1Input>({
		customer_id: customerId,
		plan_id: quarterlyPro.id,
		redirect_mode: "if_required",
		license_quantities: [
			{ license_plan_id: quarterlySeat.id, quantity: SEAT_QUANTITY },
		],
	});
	await autumnV2_3.licenses.attach({
		customer_id: customerId,
		plan_id: quarterlySeat.id,
		entities: entities.map((entity) => ({ entity_id: entity.id })),
	});

	let customer = await autumnV2_3.customers.get<ApiCustomerV5>(customerId);
	await expectCustomerProducts({
		customer,
		active: [quarterlyPro.id],
		notPresent: [annualProId, quarterlySeat.id, annualSeatId],
	});
	expectCustomerLicenses({
		customer,
		count: 1,
		licenses: [
			{
				license_plan_id: quarterlySeat.id,
				parent_plan_id: quarterlyPro.id,
				paid_quantity: SEAT_QUANTITY,
				granted: SEAT_QUANTITY,
				usage: entities.length,
				remaining: SEAT_QUANTITY - entities.length,
			},
		],
	});
	const quarterlyAssignments = await listLicenseAssignments({
		autumn: autumnV2_3,
		customerId,
		licensePlanId: quarterlySeat.id,
		active: true,
	});
	expect(quarterlyAssignments).toHaveLength(entities.length);
	await expectStripeSubscriptionCorrect({ ctx, customerId });

	await autumnV2_3.billing.attach<AttachParamsV1Input>({
		customer_id: customerId,
		plan_id: annualProId,
		redirect_mode: "if_required",
		license_quantities: [
			{ license_plan_id: annualSeatId, quantity: SEAT_QUANTITY },
		],
	});

	customer = await autumnV2_3.customers.get<ApiCustomerV5>(customerId);
	await expectCustomerProducts({
		customer,
		active: [annualProId],
		notPresent: [quarterlyPro.id, quarterlySeat.id, annualSeatId],
	});
	expectCustomerLicenses({
		customer,
		count: 1,
		licenses: [
			{
				license_plan_id: annualSeatId,
				parent_plan_id: annualProId,
				paid_quantity: SEAT_QUANTITY,
				granted: SEAT_QUANTITY,
				usage: entities.length,
				remaining: SEAT_QUANTITY - entities.length,
			},
		],
	});
	const annualAssignments = await listLicenseAssignments({
		autumn: autumnV2_3,
		customerId,
		licensePlanId: annualSeatId,
		active: true,
	});
	expect(annualAssignments).toHaveLength(entities.length);
	expect(annualAssignments).toEqual(
		expect.arrayContaining(
			entities.map((entity) =>
				expect.objectContaining({
					entity_id: entity.id,
					license_plan_id: annualSeatId,
					ended_at: null,
				}),
			),
		),
	);
	const activeQuarterlyAssignments = await listLicenseAssignments({
		autumn: autumnV2_3,
		customerId,
		licensePlanId: quarterlySeat.id,
		active: true,
	});
	expect(activeQuarterlyAssignments).toHaveLength(0);
	await expectStripeSubscriptionCorrect({ ctx, customerId });
});
