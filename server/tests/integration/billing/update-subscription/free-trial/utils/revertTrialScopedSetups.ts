import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import { addRevertTrial } from "./revertTrialUtils";

export const POOL_PRO_GRANT = 100;
export const POOL_ENTERPRISE_GRANT = 300;

export const setupEntityProSubscriptions = async ({
	customerId,
}: {
	customerId: string;
}) => {
	const pro = products.pro({
		id: "pro",
		items: [items.monthlyMessages({ includedUsage: 500 })],
	});
	const enterprise = products.base({
		id: "enterprise",
		items: [
			items.monthlyPrice({ price: 50 }),
			items.monthlyMessages({ includedUsage: 2000 }),
		],
	});

	const scenario = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
			s.products({ list: [pro, enterprise] }),
		],
		actions: [
			s.billing.attach({ productId: pro.id, entityIndex: 0 }),
			s.billing.attach({ productId: pro.id, entityIndex: 1 }),
		],
	});
	const [trialEntity, siblingEntity] = scenario.entities;

	return {
		...scenario,
		pro,
		enterprise,
		entityId: trialEntity.id,
		siblingEntity,
	};
};

export const setupPooledProSubscription = async ({
	customerId,
}: {
	customerId: string;
}) => {
	const pro = products.pro({
		id: "pooled-pro",
		items: [
			{
				...items.monthlyMessages({ includedUsage: POOL_PRO_GRANT }),
				pooled: true,
			},
		],
	});
	const enterprise = products.premium({
		id: "pooled-enterprise",
		items: [
			{
				...items.monthlyMessages({ includedUsage: POOL_ENTERPRISE_GRANT }),
				pooled: true,
			},
		],
	});

	const scenario = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.entities({ count: 1, featureId: TestFeature.Users }),
			s.products({ list: [pro, enterprise] }),
		],
		actions: [s.billing.attach({ productId: pro.id, entityIndex: 0 })],
	});

	return { ...scenario, pro, enterprise, entityId: scenario.entities[0].id };
};

export const setupLicenseProSubscription = async ({
	customerId,
}: {
	customerId: string;
}) => {
	const pro = products.pro({ id: "license-pro", items: [items.dashboard()] });
	const enterprise = products.premium({
		id: "license-enterprise",
		items: [items.dashboard()],
	});
	const seat = products.base({
		id: "license-seat",
		items: [items.monthlyMessages({ includedUsage: 25 })],
	});

	const scenario = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success", testClock: false }),
			s.entities({ count: 1, featureId: TestFeature.Users }),
			s.products({ list: [pro, enterprise, seat] }),
		],
		actions: [
			...[pro, enterprise].map((parent) =>
				s.licenses.link({
					parentProductId: parent.id,
					licenseProductId: seat.id,
					included: 1,
				}),
			),
			s.billing.attach({ productId: pro.id }),
		],
	});

	return { ...scenario, pro, enterprise, seat, entityId: undefined };
};

export const setupEntityRevertTrial = async ({
	customerId,
}: {
	customerId: string;
}) =>
	addRevertTrial({
		customerId,
		subscription: await setupEntityProSubscriptions({ customerId }),
	});

export const setupPooledRevertTrial = async ({
	customerId,
}: {
	customerId: string;
}) =>
	addRevertTrial({
		customerId,
		subscription: await setupPooledProSubscription({ customerId }),
	});

export const setupLicenseRevertTrial = async ({
	customerId,
}: {
	customerId: string;
}) => {
	const revertTrial = await addRevertTrial({
		customerId,
		subscription: await setupLicenseProSubscription({ customerId }),
	});
	await revertTrial.autumnV2_3.post("/licenses.attach", {
		customer_id: customerId,
		plan_id: revertTrial.seat.id,
		entities: [{ entity_id: revertTrial.entities[0].id }],
	});

	return revertTrial;
};
