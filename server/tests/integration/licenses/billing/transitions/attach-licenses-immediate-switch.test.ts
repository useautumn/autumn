// Cross-plan license transitions: seats follow the license plan's GROUP when
// parent plans switch. Same id pairs first; groups pair 1:1; ambiguity blocks.
import { expect, test } from "bun:test";
import {
	type ApiCustomerV5,
	ApiVersion,
	type AttachParamsV1Input,
	BillingInterval,
	type CheckResponseV3,
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
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { AutumnRpcCli } from "@/external/autumn/autumnRpcCli";
import { ProductService } from "@/internal/products/ProductService";
import { constructPriceItem } from "@/internal/products/product-items/productItemUtils";

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
		licenses: [{ license_plan_id: quarterlySeat.id, included: INCLUDED_SEATS }],
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
	expect(getProductStripeProductId({ fullProduct: annualSeatFull })).toBe(
		getProductStripeProductId({ fullProduct: quarterlySeatFull }),
	);
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

test(`${chalk.yellowBright("license transitions: plan switch pairs seats 1:1 by license plan group")}`, async () => {
	const customerId = "license-transition-group-pairing";
	const planA = products.base({
		id: "lic-group-trans-plan-a",
		items: [items.dashboard()],
	});
	const planB = products.base({
		id: "lic-group-trans-plan-b",
		items: [items.dashboard()],
	});
	const devSeatA = products.base({
		id: "lic-group-trans-dev-a",
		group: "lic-group-trans-dev",
		items: [
			constructPriceItem({ price: 10, interval: BillingInterval.Month }),
			items.monthlyMessages({ includedUsage: 100 }),
		],
	});
	const devSeatB = products.base({
		id: "lic-group-trans-dev-b",
		group: "lic-group-trans-dev",
		items: [
			constructPriceItem({ price: 15, interval: BillingInterval.Month }),
			items.monthlyMessages({ includedUsage: 200 }),
		],
	});
	const viewerSeatA = products.base({
		id: "lic-group-trans-viewer-a",
		group: "lic-group-trans-viewer",
		items: [
			constructPriceItem({ price: 5, interval: BillingInterval.Month }),
			items.monthlyWords({ includedUsage: 50 }),
		],
	});
	const viewerSeatB = products.base({
		id: "lic-group-trans-viewer-b",
		group: "lic-group-trans-viewer",
		items: [
			constructPriceItem({ price: 8, interval: BillingInterval.Month }),
			items.monthlyWords({ includedUsage: 80 }),
		],
	});

	const { ctx, entities, autumnV2_3 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success", testClock: false }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
			s.products({
				list: [planA, planB, devSeatA, devSeatB, viewerSeatA, viewerSeatB],
			}),
		],
		actions: [
			s.licenses.link({
				parentProductId: planA.id,
				licenseProductId: devSeatA.id,
				included: 0,
			}),
			s.licenses.link({
				parentProductId: planA.id,
				licenseProductId: viewerSeatA.id,
				included: 0,
			}),
			s.licenses.link({
				parentProductId: planB.id,
				licenseProductId: devSeatB.id,
				included: 0,
			}),
			s.licenses.link({
				parentProductId: planB.id,
				licenseProductId: viewerSeatB.id,
				included: 0,
			}),
		],
	});

	await autumnV2_3.billing.attach<AttachParamsV1Input>({
		customer_id: customerId,
		plan_id: planA.id,
		redirect_mode: "if_required",
		license_quantities: [
			{ license_plan_id: devSeatA.id, quantity: 2 },
			{ license_plan_id: viewerSeatA.id, quantity: 1 },
		],
	});
	await autumnV2_3.licenses.attach({
		customer_id: customerId,
		plan_id: devSeatA.id,
		entities: entities.map((entity) => ({ entity_id: entity.id })),
	});
	await autumnV2_3.licenses.attach({
		customer_id: customerId,
		plan_id: viewerSeatA.id,
		entities: [{ entity_id: entities[0].id }],
	});

	await autumnV2_3.billing.attach<AttachParamsV1Input>({
		customer_id: customerId,
		plan_id: planB.id,
		redirect_mode: "if_required",
		license_quantities: [
			{ license_plan_id: devSeatB.id, quantity: 2 },
			{ license_plan_id: viewerSeatB.id, quantity: 1 },
		],
	});

	const customer = await autumnV2_3.customers.get<ApiCustomerV5>(customerId);
	await expectCustomerProducts({
		customer,
		active: [planB.id],
		notPresent: [planA.id],
	});
	expectCustomerLicenses({
		customer,
		count: 2,
		licenses: [
			{
				license_plan_id: devSeatB.id,
				parent_plan_id: planB.id,
				paid_quantity: 2,
				granted: 2,
				usage: 2,
				remaining: 0,
			},
			{
				license_plan_id: viewerSeatB.id,
				parent_plan_id: planB.id,
				paid_quantity: 1,
				granted: 1,
				usage: 1,
				remaining: 0,
			},
		],
	});

	// Seats followed their group; nothing remains on plan A's licenses.
	const devAssignments = await listLicenseAssignments({
		autumn: autumnV2_3,
		customerId,
		licensePlanId: devSeatB.id,
		active: true,
	});
	expect(devAssignments).toHaveLength(2);
	const viewerAssignments = await listLicenseAssignments({
		autumn: autumnV2_3,
		customerId,
		licensePlanId: viewerSeatB.id,
		active: true,
	});
	expect(viewerAssignments).toHaveLength(1);
	expect(viewerAssignments[0].entity_id).toBe(entities[0].id);
	for (const oldSeatId of [devSeatA.id, viewerSeatA.id]) {
		const oldAssignments = await listLicenseAssignments({
			autumn: autumnV2_3,
			customerId,
			licensePlanId: oldSeatId,
			active: true,
		});
		expect(oldAssignments).toHaveLength(0);
	}

	// Entity grants now come from plan B's seat definitions.
	const devCheck = await autumnV2_3.check<CheckResponseV3>({
		customer_id: customerId,
		entity_id: entities[1].id,
		feature_id: TestFeature.Messages,
	});
	expect(devCheck.balance?.granted).toBe(200);
	const viewerCheck = await autumnV2_3.check<CheckResponseV3>({
		customer_id: customerId,
		entity_id: entities[0].id,
		feature_id: TestFeature.Words,
	});
	expect(viewerCheck.balance?.granted).toBe(80);

	await expectStripeSubscriptionCorrect({ ctx, customerId });
});

test(`${chalk.yellowBright("license transitions: ambiguous group match with active assignments blocks the switch")}`, async () => {
	const customerId = "license-transition-group-ambiguous";
	const planA = products.base({
		id: "lic-group-ambig-plan-a",
		items: [items.dashboard()],
	});
	const planB = products.base({
		id: "lic-group-ambig-plan-b",
		items: [items.dashboard()],
	});
	const devSeatA = products.base({
		id: "lic-group-ambig-dev-a",
		group: "lic-group-ambig-dev",
		items: [
			constructPriceItem({ price: 10, interval: BillingInterval.Month }),
			items.monthlyMessages({ includedUsage: 100 }),
		],
	});
	const devSeatB1 = products.base({
		id: "lic-group-ambig-dev-b1",
		group: "lic-group-ambig-dev",
		items: [
			constructPriceItem({ price: 15, interval: BillingInterval.Month }),
			items.monthlyMessages({ includedUsage: 200 }),
		],
	});
	const devSeatB2 = products.base({
		id: "lic-group-ambig-dev-b2",
		group: "lic-group-ambig-dev",
		items: [
			constructPriceItem({ price: 25, interval: BillingInterval.Month }),
			items.monthlyMessages({ includedUsage: 500 }),
		],
	});

	const { autumnV2_3, entities } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success", testClock: false }),
			s.entities({ count: 1, featureId: TestFeature.Users }),
			s.products({ list: [planA, planB, devSeatA, devSeatB1, devSeatB2] }),
		],
		actions: [
			s.licenses.link({
				parentProductId: planA.id,
				licenseProductId: devSeatA.id,
				included: 0,
			}),
			s.licenses.link({
				parentProductId: planB.id,
				licenseProductId: devSeatB1.id,
				included: 0,
			}),
			s.licenses.link({
				parentProductId: planB.id,
				licenseProductId: devSeatB2.id,
				included: 0,
			}),
		],
	});

	await autumnV2_3.billing.attach<AttachParamsV1Input>({
		customer_id: customerId,
		plan_id: planA.id,
		redirect_mode: "if_required",
		license_quantities: [{ license_plan_id: devSeatA.id, quantity: 1 }],
	});
	await autumnV2_3.licenses.attach({
		customer_id: customerId,
		plan_id: devSeatA.id,
		entities: [{ entity_id: entities[0].id }],
	});

	await expectAutumnError({
		errMessage: "not a 1:1 match",
		func: () =>
			autumnV2_3.billing.attach<AttachParamsV1Input>({
				customer_id: customerId,
				plan_id: planB.id,
				redirect_mode: "if_required",
				license_quantities: [{ license_plan_id: devSeatB1.id, quantity: 1 }],
			}),
	});
});

test(`${chalk.yellowBright("license transitions: unused pools never block an ambiguous or dropped switch")}`, async () => {
	const customerId = "license-transition-group-unused";
	const planA = products.base({
		id: "lic-group-unused-plan-a",
		items: [items.dashboard()],
	});
	const planB = products.base({
		id: "lic-group-unused-plan-b",
		items: [items.dashboard()],
	});
	const devSeatA = products.base({
		id: "lic-group-unused-dev-a",
		group: "lic-group-unused-dev",
		items: [
			constructPriceItem({ price: 10, interval: BillingInterval.Month }),
			items.monthlyMessages({ includedUsage: 100 }),
		],
	});
	const devSeatB1 = products.base({
		id: "lic-group-unused-dev-b1",
		group: "lic-group-unused-dev",
		items: [
			constructPriceItem({ price: 15, interval: BillingInterval.Month }),
			items.monthlyMessages({ includedUsage: 200 }),
		],
	});
	const devSeatB2 = products.base({
		id: "lic-group-unused-dev-b2",
		group: "lic-group-unused-dev",
		items: [
			constructPriceItem({ price: 25, interval: BillingInterval.Month }),
			items.monthlyMessages({ includedUsage: 500 }),
		],
	});

	const { autumnV2_3 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success", testClock: false }),
			s.products({ list: [planA, planB, devSeatA, devSeatB1, devSeatB2] }),
		],
		actions: [
			s.licenses.link({
				parentProductId: planA.id,
				licenseProductId: devSeatA.id,
				included: 0,
			}),
			s.licenses.link({
				parentProductId: planB.id,
				licenseProductId: devSeatB1.id,
				included: 0,
			}),
			s.licenses.link({
				parentProductId: planB.id,
				licenseProductId: devSeatB2.id,
				included: 0,
			}),
		],
	});

	// Paid but unassigned: usage is 0, so the ambiguous group cannot block.
	await autumnV2_3.billing.attach<AttachParamsV1Input>({
		customer_id: customerId,
		plan_id: planA.id,
		redirect_mode: "if_required",
		license_quantities: [{ license_plan_id: devSeatA.id, quantity: 1 }],
	});
	await autumnV2_3.billing.attach<AttachParamsV1Input>({
		customer_id: customerId,
		plan_id: planB.id,
		redirect_mode: "if_required",
	});

	const customer = await autumnV2_3.customers.get<ApiCustomerV5>(customerId);
	await expectCustomerProducts({
		customer,
		active: [planB.id],
		notPresent: [planA.id],
	});
});
