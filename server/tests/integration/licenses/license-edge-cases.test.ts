import { expect, test } from "bun:test";
import {
	type ApiEntityV2,
	type AttachParamsV1Input,
	type CheckResponseV3,
	ErrCode,
	fullCustomerToFullSubject,
	fullSubjectToApiCustomerProducts,
	type LicenseBalanceResponse,
	type ProductV2,
	planLicenses,
	type TrackResponseV3,
	type UpdateSubscriptionV1ParamsInput,
} from "@autumn/shared";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils.js";
import { items } from "@tests/utils/fixtures/items.js";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { and, eq, isNotNull } from "drizzle-orm";
import { CusService } from "@/internal/customers/CusService.js";

const makeParentProduct = ({
	id = "license-parent",
	messageGrant,
	includeDashboard = true,
	group,
}: {
	id?: string;
	messageGrant?: number;
	includeDashboard?: boolean;
	group?: string;
} = {}) =>
	products.base({
		id,
		group,
		items: [
			...(includeDashboard ? [items.dashboard()] : []),
			...(messageGrant
				? [items.monthlyMessages({ includedUsage: messageGrant })]
				: []),
		],
	});

const makeLicenseProduct = ({
	id = "license-seat",
	messageGrant = 25,
}: {
	id?: string;
	messageGrant?: number;
} = {}) => ({
	...products.base({
		id,
		items: [items.monthlyMessages({ includedUsage: messageGrant })],
	}),
});

const setupAssignedLicense = async ({
	customerId,
	parentMessageGrant,
	licenseMessageGrant = 25,
	included = 1,
	entityCount = 1,
	customize,
}: {
	customerId: string;
	parentMessageGrant?: number;
	licenseMessageGrant?: number;
	included?: number;
	entityCount?: number;
	customize?: Record<string, unknown> | null;
}) => {
	const parent = makeParentProduct({ messageGrant: parentMessageGrant });
	const license = makeLicenseProduct({ messageGrant: licenseMessageGrant });

	const result = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: false }),
			s.entities({ count: entityCount, featureId: TestFeature.Users }),
			s.products({ list: [parent, license] }),
		],
		actions: [s.billing.attach({ productId: parent.id })],
	});

	await result.autumnV2_2.post("/licenses.link", {
		parent_plan_id: parent.id,
		license_plan_id: license.id,
		included: included,
		...(customize !== undefined ? { customize } : {}),
	});

	const assignResponse = (await result.autumnV2_2.post("/licenses.attach", {
		customer_id: result.customerId,
		entity_id: result.entities[0].id,
		plan_id: license.id,
	})) as {
		assignment: {
			id: string;
			started_at: number;
			ended_at: number | null;
		};
	};

	return { ...result, parent, license, assignment: assignResponse.assignment };
};

const getBalanceBreakdown = (
	response: CheckResponseV3 | TrackResponseV3,
	planId: string,
) => response.balance?.breakdown?.find((item) => item.plan_id === planId);

test(`${chalk.yellowBright("licenses-custom: attach license patch swaps out an inherited license")}`, async () => {
	const parent = makeParentProduct({ id: "lic-custom-attach-parent" });
	const baseLicense = makeLicenseProduct({ id: "lic-custom-attach-base" });
	const customLicense = makeLicenseProduct({
		id: "lic-custom-attach-seat",
	});
	const { customerId, autumnV2_2 } = await initScenario({
		customerId: "lic-custom-attach",
		setup: [
			s.customer({ testClock: false }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
			s.products({ list: [parent, baseLicense, customLicense] }),
		],
		actions: [],
	});

	await autumnV2_2.post("/licenses.link", {
		parent_plan_id: parent.id,
		license_plan_id: baseLicense.id,
		included: 1,
	});
	await autumnV2_2.billing.attach({
		customer_id: customerId,
		plan_id: parent.id,
		customize: {
			add_licenses: [
				{
					license_plan_id: customLicense.id,
					included: 2,
				},
			],
			remove_licenses: [baseLicense.id],
		},
	});

	const pools = (await autumnV2_2.post("/licenses.list", {
		customer_id: customerId,
	})) as { list: LicenseBalanceResponse[] };
	expect(pools.list).toHaveLength(1);
	expect(pools.list[0]).toMatchObject({
		license_plan_id: customLicense.id,
		inventory: { included: 2, assigned: 0, available: 2 },
	});
});

test(`${chalk.yellowBright("licenses-custom: remove_licenses suppresses an inherited license")}`, async () => {
	const parent = makeParentProduct({ id: "lic-custom-empty-parent" });
	const license = makeLicenseProduct({ id: "lic-custom-empty-seat" });
	const { customerId, entities, autumnV2_2 } = await initScenario({
		customerId: "lic-custom-empty",
		setup: [
			s.customer({ testClock: false }),
			s.entities({ count: 1, featureId: TestFeature.Users }),
			s.products({ list: [parent, license] }),
		],
		actions: [],
	});

	await autumnV2_2.post("/licenses.link", {
		parent_plan_id: parent.id,
		license_plan_id: license.id,
		included: 1,
	});
	await autumnV2_2.billing.attach({
		customer_id: customerId,
		plan_id: parent.id,
		customize: { remove_licenses: [license.id] },
	});

	const pools = (await autumnV2_2.post("/licenses.list", {
		customer_id: customerId,
	})) as { list: LicenseBalanceResponse[] };
	expect(pools.list).toEqual([]);
	await expectAutumnError({
		errCode: ErrCode.InvalidRequest,
		func: () =>
			autumnV2_2.post("/licenses.attach", {
				customer_id: customerId,
				entity_id: entities[0].id,
				plan_id: license.id,
			}),
	});
});

test(`${chalk.yellowBright("licenses-custom: preview validates but does not persist license override")}`, async () => {
	const { customerId, autumnV2_2, ctx, parent, license } =
		await setupAssignedLicense({
			customerId: "lic-custom-preview",
			included: 1,
		});

	await expectAutumnError({
		errCode: ErrCode.InvalidRequest,
		func: () =>
			autumnV2_2.subscriptions.previewUpdate<UpdateSubscriptionV1ParamsInput>({
				customer_id: customerId,
				plan_id: parent.id,
				customize: { remove_licenses: [license.id] },
			}),
	});

	await autumnV2_2.subscriptions.previewUpdate<UpdateSubscriptionV1ParamsInput>(
		{
			customer_id: customerId,
			plan_id: parent.id,
			customize: {
				add_licenses: [
					{
						license_plan_id: license.id,
						included: 1,
					},
				],
			},
		},
	);

	const customRows = await ctx.db.query.planLicenses.findMany({
		where: and(
			eq(planLicenses.license_internal_product_id, license.internal_id!),
			isNotNull(planLicenses.parent_customer_product_id),
		),
	});
	expect(customRows).toHaveLength(0);
});

test(`${chalk.yellowBright("licenses-custom: billing.update syncs license override onto existing parent")}`, async () => {
	const { customerId, entities, autumnV2_2, ctx, parent, license } =
		await setupAssignedLicense({
			customerId: "lic-custom-update-existing",
			included: 2,
			entityCount: 2,
		});

	await autumnV2_2.billing.update({
		customer_id: customerId,
		plan_id: parent.id,
		customize: {
			add_licenses: [
				{
					license_plan_id: license.id,
					included: 3,
				},
			],
		},
	});

	const fullCustomer = await CusService.getFull({
		ctx,
		idOrInternalId: customerId,
	});
	const parentCustomerProduct = fullCustomer.customer_products.find(
		(customerProduct) => customerProduct.product.id === parent.id,
	);
	const customRows = await ctx.db.query.planLicenses.findMany({
		where: eq(
			planLicenses.parent_customer_product_id,
			parentCustomerProduct!.id,
		),
	});
	expect(customRows).toHaveLength(1);
	expect(customRows[0].included).toBe(3);

	const pools = (await autumnV2_2.post("/licenses.list", {
		customer_id: customerId,
	})) as { list: LicenseBalanceResponse[] };
	expect(pools.list[0]).toMatchObject({
		license_plan_id: license.id,
		inventory: { included: 3, assigned: 1, available: 2 },
	});

	await autumnV2_2.post("/licenses.attach", {
		customer_id: customerId,
		entity_id: entities[1].id,
		plan_id: license.id,
	});
	const poolsAfterSecondAssign = (await autumnV2_2.post("/licenses.list", {
		customer_id: customerId,
	})) as { list: LicenseBalanceResponse[] };
	expect(poolsAfterSecondAssign.list[0]).toMatchObject({
		license_plan_id: license.id,
		inventory: { included: 3, assigned: 2, available: 1 },
	});
});

test(`${chalk.yellowBright("licenses-custom: attach transition moves assignments to custom pool")}`, async () => {
	const group = "lic-custom-switch-group";
	const firstParent = makeParentProduct({
		id: "lic-custom-switch-first",
		group,
	});
	const secondParent = makeParentProduct({
		id: "lic-custom-switch-second",
		group,
	});
	const license = makeLicenseProduct({ id: "lic-custom-switch-seat" });
	const { customerId, entities, autumnV2_2, ctx } = await initScenario({
		customerId: "lic-custom-switch",
		setup: [
			s.customer({ testClock: false }),
			s.entities({ count: 1, featureId: TestFeature.Users }),
			s.products({ list: [firstParent, secondParent, license] }),
		],
		actions: [s.billing.attach({ productId: firstParent.id })],
	});

	await autumnV2_2.post("/licenses.link", {
		parent_plan_id: firstParent.id,
		license_plan_id: license.id,
		included: 1,
	});
	await autumnV2_2.post("/licenses.attach", {
		customer_id: customerId,
		entity_id: entities[0].id,
		plan_id: license.id,
	});

	await autumnV2_2.billing.attach<AttachParamsV1Input>({
		customer_id: customerId,
		plan_id: secondParent.id,
		customize: {
			add_licenses: [
				{
					license_plan_id: license.id,
					included: 1,
				},
			],
		},
	});

	const fullCustomer = await CusService.getFull({
		ctx,
		idOrInternalId: customerId,
	});
	const secondCustomerProduct = fullCustomer.customer_products.find(
		(customerProduct) => customerProduct.product.id === secondParent.id,
	);

	const pools = (await autumnV2_2.post("/licenses.list", {
		customer_id: customerId,
	})) as { list: LicenseBalanceResponse[] };
	expect(pools.list).toHaveLength(1);
	expect(pools.list[0]).toMatchObject({
		license_plan_id: license.id,
		inventory: { included: 1, assigned: 1, available: 0 },
		assignments: [{ entity_id: entities[0].id }],
	});
});

test(`${chalk.yellowBright("licenses-custom: attach transition blocks unsafe license removal")}`, async () => {
	const group = "lic-custom-switch-reduce-group";
	const firstParent = makeParentProduct({
		id: "lic-custom-switch-reduce-first",
		group,
	});
	const secondParent = makeParentProduct({
		id: "lic-custom-switch-reduce-second",
		group,
	});
	const license = makeLicenseProduct({ id: "lic-custom-switch-reduce-seat" });
	const { customerId, entities, autumnV2_2 } = await initScenario({
		customerId: "lic-custom-switch-reduce",
		setup: [
			s.customer({ testClock: false }),
			s.entities({ count: 1, featureId: TestFeature.Users }),
			s.products({ list: [firstParent, secondParent, license] }),
		],
		actions: [s.billing.attach({ productId: firstParent.id })],
	});

	await autumnV2_2.post("/licenses.link", {
		parent_plan_id: firstParent.id,
		license_plan_id: license.id,
		included: 1,
	});
	await autumnV2_2.post("/licenses.attach", {
		customer_id: customerId,
		entity_id: entities[0].id,
		plan_id: license.id,
	});

	await expectAutumnError({
		errCode: ErrCode.InvalidRequest,
		func: () =>
			autumnV2_2.billing.attach<AttachParamsV1Input>({
				customer_id: customerId,
				plan_id: secondParent.id,
				customize: { remove_licenses: [license.id] },
			}),
	});
});

test(`${chalk.yellowBright("licenses-custom: multi_attach provisions custom license pool")}`, async () => {
	const parent = makeParentProduct({ id: "lic-custom-multi-parent" });
	const license = makeLicenseProduct({ id: "lic-custom-multi-seat" });
	const { customerId, autumnV2_2 } = await initScenario({
		customerId: "lic-custom-multi",
		setup: [
			s.customer({ testClock: false }),
			s.entities({ count: 1, featureId: TestFeature.Users }),
			s.products({ list: [parent, license] }),
		],
		actions: [],
	});

	await autumnV2_2.post("/licenses.link", {
		parent_plan_id: parent.id,
		license_plan_id: license.id,
		included: 1,
	});
	await autumnV2_2.billing.multiAttach({
		customer_id: customerId,
		plans: [
			{
				plan_id: parent.id,
				customize: {
					add_licenses: [
						{
							license_plan_id: license.id,
							included: 2,
						},
					],
				},
			},
		],
	});

	const pools = (await autumnV2_2.post("/licenses.list", {
		customer_id: customerId,
	})) as { list: LicenseBalanceResponse[] };
	expect(pools.list).toHaveLength(1);
	expect(pools.list[0]).toMatchObject({
		license_plan_id: license.id,
		inventory: { included: 2, assigned: 0, available: 2 },
	});
});

test(`${chalk.yellowBright("licenses-custom: active assignments block unsafe custom reductions")}`, async () => {
	const { customerId, autumnV2_2, parent, license } =
		await setupAssignedLicense({
			customerId: "lic-custom-reduce-block",
			included: 1,
		});

	await expectAutumnError({
		errCode: ErrCode.InvalidRequest,
		func: () =>
			autumnV2_2.billing.update({
				customer_id: customerId,
				plan_id: parent.id,
				customize: { remove_licenses: [license.id] },
			}),
	});

	await expectAutumnError({
		errCode: ErrCode.InvalidRequest,
		func: () =>
			autumnV2_2.billing.update({
				customer_id: customerId,
				plan_id: parent.id,
				customize: {
					add_licenses: [
						{
							license_plan_id: license.id,
							included: 0,
						},
					],
				},
			}),
	});
});

test(`${chalk.yellowBright("licenses-custom: custom license edits affect future assignments only")}`, async () => {
	const { customerId, entities, autumnV2_2, parent, license } =
		await setupAssignedLicense({
			customerId: "lic-custom-future-only",
			included: 2,
			entityCount: 2,
		});

	await autumnV2_2.billing.update({
		customer_id: customerId,
		plan_id: parent.id,
		customize: {
			add_licenses: [
				{
					license_plan_id: license.id,
					included: 2,
					customize: {
						items: [itemsV2.monthlyMessages({ included: 50 })],
					},
				},
			],
		},
	});
	await autumnV2_2.post("/licenses.attach", {
		customer_id: customerId,
		entity_id: entities[1].id,
		plan_id: license.id,
	});

	const firstEntity = await autumnV2_2.check<CheckResponseV3>({
		customer_id: customerId,
		entity_id: entities[0].id,
		feature_id: TestFeature.Messages,
	});
	const secondEntity = await autumnV2_2.check<CheckResponseV3>({
		customer_id: customerId,
		entity_id: entities[1].id,
		feature_id: TestFeature.Messages,
	});
	expect(firstEntity.balance?.granted).toBe(25);
	expect(secondEntity.balance?.granted).toBe(50);
});

test(`${chalk.yellowBright("licenses-edge: provisioned license stays entity-level internally and hidden from API products")}`, async () => {
	const { customerId, entities, autumnV2_2, ctx, parent, license } =
		await setupAssignedLicense({
			customerId: "lic-edge-internal",
		});

	const fullCustomer = await CusService.getFull({
		ctx,
		idOrInternalId: customerId,
		entityId: entities[0].id,
		withEntities: true,
	});
	const licenseCusProduct = fullCustomer.customer_products.find(
		(customerProduct) => customerProduct.product.id === license.id,
	);
	expect(licenseCusProduct).toBeDefined();
	expect(licenseCusProduct?.internal_entity_id).toBe(
		fullCustomer.entity?.internal_id,
	);
	expect(licenseCusProduct?.customer_prices).toHaveLength(0);
	expect(licenseCusProduct?.subscription_ids).toEqual([]);
	expect(licenseCusProduct?.scheduled_ids).toEqual([]);
	expect(
		licenseCusProduct?.customer_entitlements.every(
			(entitlement) =>
				entitlement.internal_entity_id === fullCustomer.entity?.internal_id,
		),
	).toBe(true);

	const fullSubject = fullCustomerToFullSubject({ fullCustomer });
	const apiProducts = fullSubjectToApiCustomerProducts({ fullSubject });
	expect(apiProducts.map((item) => item.product.id)).toEqual([parent.id]);

	const entity = await autumnV2_2.entities.get<ApiEntityV2>(
		customerId,
		entities[0].id,
	);
	expectBalanceCorrect({
		customer: entity,
		featureId: TestFeature.Messages,
		granted: 25,
		remaining: 25,
		usage: 0,
		planId: license.id,
	});
	expect(
		entity.subscriptions.some(
			(subscription) => subscription.plan_id === license.id,
		),
	).toBe(false);
});

test(`${chalk.yellowBright("licenses-edge: entity check stacks customer grant and license grant")}`, async () => {
	const { customerId, entities, autumnV2_2, parent, license } =
		await setupAssignedLicense({
			customerId: "lic-edge-stack-check",
			parentMessageGrant: 10,
		});

	const customerCheck = await autumnV2_2.check<CheckResponseV3>({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
	});
	expect(customerCheck.allowed).toBe(true);
	expect(customerCheck.balance?.granted).toBe(10);
	expect(getBalanceBreakdown(customerCheck, parent.id)).toMatchObject({
		included_grant: 10,
		remaining: 10,
		usage: 0,
	});
	expect(getBalanceBreakdown(customerCheck, license.id)).toBeUndefined();

	const entityCheck = await autumnV2_2.check<CheckResponseV3>({
		customer_id: customerId,
		entity_id: entities[0].id,
		feature_id: TestFeature.Messages,
	});
	expect(entityCheck.allowed).toBe(true);
	expect(entityCheck.balance?.granted).toBe(35);
	expect(entityCheck.balance?.remaining).toBe(35);
	expect(getBalanceBreakdown(entityCheck, parent.id)).toMatchObject({
		included_grant: 10,
	});
	expect(getBalanceBreakdown(entityCheck, license.id)).toMatchObject({
		included_grant: 25,
	});
});

test(`${chalk.yellowBright("licenses-edge: entity track deducts inherited and license balances")}`, async () => {
	const { customerId, entities, autumnV2_2, parent, license } =
		await setupAssignedLicense({
			customerId: "lic-edge-track-stack",
			parentMessageGrant: 10,
		});

	const trackResponse = (await autumnV2_2.track(
		{
			customer_id: customerId,
			entity_id: entities[0].id,
			feature_id: TestFeature.Messages,
			value: 35,
		},
		{ timeout: 2000 },
	)) as TrackResponseV3;
	expect(trackResponse.entity_id).toBe(entities[0].id);
	expect(trackResponse.balance?.granted).toBe(35);
	expect(trackResponse.balance?.remaining).toBe(0);
	expect(trackResponse.balance?.usage).toBe(35);
	expect(getBalanceBreakdown(trackResponse, parent.id)).toMatchObject({
		included_grant: 10,
		remaining: 0,
		usage: 10,
	});
	expect(getBalanceBreakdown(trackResponse, license.id)).toMatchObject({
		included_grant: 25,
		remaining: 0,
		usage: 25,
	});
	expect(
		trackResponse.deductions?.find((item) => item.plan_id === parent.id)?.value,
	).toBe(10);
	expect(
		trackResponse.deductions?.find((item) => item.plan_id === license.id)
			?.value,
	).toBe(25);

	const customerCheck = await autumnV2_2.check<CheckResponseV3>({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		skip_cache: true,
	});
	expect(customerCheck.allowed).toBe(false);
	expect(customerCheck.balance?.granted).toBe(10);
	expect(customerCheck.balance?.remaining).toBe(0);
	expect(customerCheck.balance?.usage).toBe(10);
	expect(getBalanceBreakdown(customerCheck, license.id)).toBeUndefined();
});

test(`${chalk.yellowBright("licenses-edge: customer and sibling entity cannot spend assigned license")}`, async () => {
	const { customerId, entities, autumnV2_2, license } =
		await setupAssignedLicense({
			customerId: "lic-edge-track-scope",
			entityCount: 2,
		});

	const customerTrack = (await autumnV2_2.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 1,
		overage_behavior: "reject",
	})) as TrackResponseV3;
	expect(customerTrack.balance).toBeNull();
	expect(customerTrack.deductions).toEqual([]);

	const siblingTrack = (await autumnV2_2.track({
		customer_id: customerId,
		entity_id: entities[1].id,
		feature_id: TestFeature.Messages,
		value: 1,
		overage_behavior: "reject",
	})) as TrackResponseV3;
	expect(siblingTrack.balance).toBeNull();
	expect(siblingTrack.deductions).toEqual([]);

	const assignedEntity = await autumnV2_2.check<CheckResponseV3>({
		customer_id: customerId,
		entity_id: entities[0].id,
		feature_id: TestFeature.Messages,
	});
	expect(assignedEntity.allowed).toBe(true);
	expect(assignedEntity.balance?.remaining).toBe(25);

	const siblingEntity = await autumnV2_2.check<CheckResponseV3>({
		customer_id: customerId,
		entity_id: entities[1].id,
		feature_id: TestFeature.Messages,
	});
	expect(siblingEntity.allowed).toBe(false);
	expect(siblingEntity.balance).toBeNull();

	const pools = (await autumnV2_2.post("/licenses.list", {
		customer_id: customerId,
	})) as { list: LicenseBalanceResponse[] };
	expect(pools.list[0]).toMatchObject({
		license_plan_id: license.id,
		inventory: { assigned: 1, available: 0 },
	});
});

test(`${chalk.yellowBright("licenses-edge: duplicate assign is idempotent and does not double grant")}`, async () => {
	const { customerId, entities, autumnV2_2, assignment, license } =
		await setupAssignedLicense({
			customerId: "lic-edge-idempotent",
		});

	const duplicate = (await autumnV2_2.post("/licenses.attach", {
		customer_id: customerId,
		entity_id: entities[0].id,
		plan_id: license.id,
	})) as { assignment: typeof assignment };
	expect(duplicate.assignment.id).toBe(assignment.id);
	expect(duplicate.assignment.started_at).toBe(assignment.started_at);

	const assignments = (await autumnV2_2.post("/licenses.list_assignments", {
		customer_id: customerId,
		plan_id: license.id,
	})) as { list: unknown[] };
	expect(assignments.list).toHaveLength(1);

	const check = await autumnV2_2.check<CheckResponseV3>({
		customer_id: customerId,
		entity_id: entities[0].id,
		feature_id: TestFeature.Messages,
	});
	expect(check.balance?.granted).toBe(25);
	expect(check.balance?.breakdown).toHaveLength(1);

	const track = (await autumnV2_2.track({
		customer_id: customerId,
		entity_id: entities[0].id,
		feature_id: TestFeature.Messages,
		value: 25,
	})) as TrackResponseV3;
	expect(track.balance?.remaining).toBe(0);
	expect(track.deductions).toHaveLength(1);
});

test(`${chalk.yellowBright("licenses-edge: two assigned entities isolate license balances and share customer grant")}`, async () => {
	const { customerId, entities, autumnV2_2, parent, license } =
		await setupAssignedLicense({
			customerId: "lic-edge-two-entities",
			parentMessageGrant: 10,
			included: 2,
			entityCount: 2,
		});
	await autumnV2_2.post("/licenses.attach", {
		customer_id: customerId,
		entity_id: entities[1].id,
		plan_id: license.id,
	});

	await autumnV2_2.track(
		{
			customer_id: customerId,
			entity_id: entities[0].id,
			feature_id: TestFeature.Messages,
			value: 35,
		},
		{ timeout: 2000 },
	);

	const customerCheck = await autumnV2_2.check<CheckResponseV3>({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		skip_cache: true,
	});
	expect(customerCheck.balance?.granted).toBe(10);
	expect(customerCheck.balance?.remaining).toBe(0);
	expect(customerCheck.balance?.usage).toBe(10);
	expect(getBalanceBreakdown(customerCheck, parent.id)).toBeDefined();
	expect(getBalanceBreakdown(customerCheck, license.id)).toBeUndefined();

	const entityOne = await autumnV2_2.entities.get<ApiEntityV2>(
		customerId,
		entities[0].id,
	);
	expectBalanceCorrect({
		customer: entityOne,
		featureId: TestFeature.Messages,
		granted: 35,
		remaining: 0,
		usage: 35,
	});

	const entityTwo = await autumnV2_2.entities.get<ApiEntityV2>(
		customerId,
		entities[1].id,
	);
	expectBalanceCorrect({
		customer: entityTwo,
		featureId: TestFeature.Messages,
		granted: 35,
		remaining: 25,
		usage: 10,
	});
	const entityTwoMessages = entityTwo.balances[TestFeature.Messages];
	expect(entityTwoMessages).toBeDefined();
	expect(
		entityTwoMessages?.breakdown?.find((item) => item.plan_id === parent.id),
	).toMatchObject({ remaining: 0, usage: 10 });
	expect(
		entityTwoMessages?.breakdown?.find((item) => item.plan_id === license.id),
	).toMatchObject({ remaining: 25, usage: 0 });
});

test(`${chalk.yellowBright("licenses-edge: unassign is idempotent and removes only the license grant")}`, async () => {
	const { customerId, entities, autumnV2_2, assignment, parent, license } =
		await setupAssignedLicense({
			customerId: "lic-edge-unassign",
			parentMessageGrant: 10,
		});

	const first = (await autumnV2_2.post("/licenses.update", {
		customer_id: customerId,
		cancel_action: "cancel_immediately",
		assignment_id: assignment.id,
	})) as { assignment: { id: string; ended_at: number | null } };
	const second = (await autumnV2_2.post("/licenses.update", {
		customer_id: customerId,
		cancel_action: "cancel_immediately",
		assignment_id: assignment.id,
	})) as { assignment: { id: string; ended_at: number | null } };
	expect(second.assignment).toEqual(first.assignment);

	const entityCheck = await autumnV2_2.check<CheckResponseV3>({
		customer_id: customerId,
		entity_id: entities[0].id,
		feature_id: TestFeature.Messages,
	});
	expect(entityCheck.balance?.granted).toBe(10);
	expect(getBalanceBreakdown(entityCheck, parent.id)).toBeDefined();
	expect(getBalanceBreakdown(entityCheck, license.id)).toBeUndefined();

	const track = (await autumnV2_2.track({
		customer_id: customerId,
		entity_id: entities[0].id,
		feature_id: TestFeature.Messages,
		value: 10,
	})) as TrackResponseV3;
	expect(track.balance?.remaining).toBe(0);
	await expectAutumnError({
		errCode: ErrCode.InsufficientBalance,
		func: () =>
			autumnV2_2.track({
				customer_id: customerId,
				entity_id: entities[0].id,
				feature_id: TestFeature.Messages,
				value: 1,
				overage_behavior: "reject",
			}),
	});
});

test(`${chalk.yellowBright("licenses-edge: customize null removes override for future assignments")}`, async () => {
	const parent = makeParentProduct({ id: "license-null-parent" });
	const license = makeLicenseProduct({ id: "license-null-seat" });
	const { customerId, entities, autumnV2_2 } = await initScenario({
		customerId: "lic-edge-custom-null",
		setup: [
			s.customer({ testClock: false }),
			s.entities({ count: 1, featureId: TestFeature.Users }),
			s.products({ list: [parent, license] }),
		],
		actions: [s.billing.attach({ productId: parent.id })],
	});

	await autumnV2_2.post("/licenses.link", {
		parent_plan_id: parent.id,
		license_plan_id: license.id,
		included: 1,
		customize: { items: [itemsV2.monthlyMessages({ included: 100 })] },
	});
	await autumnV2_2.post("/licenses.link", {
		parent_plan_id: parent.id,
		license_plan_id: license.id,
		included: 1,
		customize: null,
	});

	const { list } = (await autumnV2_2.post("/licenses.list_links", {
		parent_plan_id: parent.id,
	})) as { list: Array<{ customize: unknown }> };
	expect(list[0].customize).toBeNull();

	await autumnV2_2.post("/licenses.attach", {
		customer_id: customerId,
		entity_id: entities[0].id,
		plan_id: license.id,
	});
	const check = await autumnV2_2.check<CheckResponseV3>({
		customer_id: customerId,
		entity_id: entities[0].id,
		feature_id: TestFeature.Messages,
	});
	expect(check.balance?.granted).toBe(25);
});

test(`${chalk.yellowBright("licenses-edge: existing assignment keeps old customize after plan license update")}`, async () => {
	const parent = makeParentProduct({ id: "license-snapshot-parent" });
	const license = makeLicenseProduct({ id: "license-snapshot-seat" });
	const { customerId, entities, autumnV2_2 } = await initScenario({
		customerId: "lic-edge-custom-snapshot",
		setup: [
			s.customer({ testClock: false }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
			s.products({ list: [parent, license] }),
		],
		actions: [s.billing.attach({ productId: parent.id })],
	});

	await autumnV2_2.post("/licenses.link", {
		parent_plan_id: parent.id,
		license_plan_id: license.id,
		included: 2,
		customize: { items: [itemsV2.monthlyMessages({ included: 100 })] },
	});
	await autumnV2_2.post("/licenses.attach", {
		customer_id: customerId,
		entity_id: entities[0].id,
		plan_id: license.id,
	});
	await autumnV2_2.post("/licenses.link", {
		parent_plan_id: parent.id,
		license_plan_id: license.id,
		included: 2,
		customize: { items: [itemsV2.monthlyMessages({ included: 50 })] },
	});
	await autumnV2_2.post("/licenses.attach", {
		customer_id: customerId,
		entity_id: entities[1].id,
		plan_id: license.id,
	});

	const firstEntity = await autumnV2_2.check<CheckResponseV3>({
		customer_id: customerId,
		entity_id: entities[0].id,
		feature_id: TestFeature.Messages,
	});
	const secondEntity = await autumnV2_2.check<CheckResponseV3>({
		customer_id: customerId,
		entity_id: entities[1].id,
		feature_id: TestFeature.Messages,
	});
	expect(firstEntity.balance?.granted).toBe(100);
	expect(secondEntity.balance?.granted).toBe(50);
});

test(`${chalk.yellowBright("licenses-edge: customize can replace base item and add boolean entitlement")}`, async () => {
	const parent = makeParentProduct({
		id: "license-custom-items-parent",
		includeDashboard: false,
	});
	const license = makeLicenseProduct({ id: "license-custom-items-seat" });
	const { customerId, entities, autumnV2_2 } = await initScenario({
		customerId: "lic-edge-custom-items",
		setup: [
			s.customer({ testClock: false }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
			s.products({ list: [parent, license] }),
		],
		actions: [s.billing.attach({ productId: parent.id })],
	});
	await autumnV2_2.post("/licenses.link", {
		parent_plan_id: parent.id,
		license_plan_id: license.id,
		included: 1,
		customize: {
			items: [itemsV2.monthlyWords({ included: 80 }), itemsV2.dashboard()],
		},
	});
	await autumnV2_2.post("/licenses.attach", {
		customer_id: customerId,
		entity_id: entities[0].id,
		plan_id: license.id,
	});

	const messagesCheck = await autumnV2_2.check<CheckResponseV3>({
		customer_id: customerId,
		entity_id: entities[0].id,
		feature_id: TestFeature.Messages,
	});
	expect(messagesCheck.allowed).toBe(false);
	expect(messagesCheck.balance).toBeNull();

	const wordsCheck = await autumnV2_2.check<CheckResponseV3>({
		customer_id: customerId,
		entity_id: entities[0].id,
		feature_id: TestFeature.Words,
	});
	expect(wordsCheck.allowed).toBe(true);
	expect(wordsCheck.balance?.granted).toBe(80);

	const dashboardCheck = await autumnV2_2.check<CheckResponseV3>({
		customer_id: customerId,
		entity_id: entities[0].id,
		feature_id: TestFeature.Dashboard,
	});
	expect(dashboardCheck.allowed).toBe(true);

	const siblingDashboard = await autumnV2_2.check<CheckResponseV3>({
		customer_id: customerId,
		entity_id: entities[1].id,
		feature_id: TestFeature.Dashboard,
	});
	expect(siblingDashboard.allowed).toBe(false);
	expect(siblingDashboard.flag).toBeNull();

	const { products: licenseProducts } = (await autumnV2_2.get(
		"/products/license_products",
	)) as { products: ProductV2[] };
	const listedLicense = licenseProducts.find((item) => item.id === license.id);
	expect(
		listedLicense?.items.some((item) => item.feature_id === TestFeature.Words),
	).toBe(false);
});

test(`${chalk.yellowBright("licenses-edge: multiple parent pools require subscription disambiguation")}`, async () => {
	const parentA = products.recurringAddOn({
		id: "license-pool-a",
		items: [items.dashboard()],
	});
	const parentB = products.recurringAddOn({
		id: "license-pool-b",
		items: [items.dashboard()],
	});
	const license = makeLicenseProduct({ id: "license-pool-seat" });
	const { customerId, entities, autumnV2_2 } = await initScenario({
		customerId: "lic-edge-multi-pool",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
			s.products({ list: [parentA, parentB, license] }),
		],
		actions: [
			s.billing.attach({
				productId: parentA.id,
				newBillingSubscription: true,
				subscriptionId: "license-pool-a-sub",
			}),
			s.billing.attach({
				productId: parentB.id,
				newBillingSubscription: true,
				subscriptionId: "license-pool-b-sub",
			}),
		],
	});

	await autumnV2_2.post("/licenses.link", {
		parent_plan_id: parentA.id,
		license_plan_id: license.id,
		included: 1,
		customize: { items: [itemsV2.monthlyMessages({ included: 50 })] },
	});
	await autumnV2_2.post("/licenses.link", {
		parent_plan_id: parentB.id,
		license_plan_id: license.id,
		included: 2,
		customize: { items: [itemsV2.monthlyMessages({ included: 200 })] },
	});
	const poolsBefore = (await autumnV2_2.post("/licenses.list", {
		customer_id: customerId,
	})) as { list: LicenseBalanceResponse[] };
	expect(poolsBefore.list).toHaveLength(2);
	const poolA = poolsBefore.list.find((pool) => pool.inventory.included === 1);
	const poolB = poolsBefore.list.find((pool) => pool.inventory.included === 2);
	expect(poolA?.parent_plan_id).toBeTruthy();
	expect(poolB?.parent_plan_id).toBeTruthy();
	expect(poolA?.parent_plan_id).not.toBe(poolB?.parent_plan_id);

	await expectAutumnError({
		errCode: ErrCode.InvalidRequest,
		func: () =>
			autumnV2_2.post("/licenses.attach", {
				customer_id: customerId,
				entity_id: entities[0].id,
				plan_id: license.id,
			}),
	});
	await autumnV2_2.post("/licenses.attach", {
		customer_id: customerId,
		entity_id: entities[0].id,
		plan_id: license.id,
		parent_plan_id: poolA?.parent_plan_id,
	});
	await autumnV2_2.post("/licenses.attach", {
		customer_id: customerId,
		entity_id: entities[1].id,
		plan_id: license.id,
		parent_plan_id: poolB?.parent_plan_id,
	});

	const firstEntity = await autumnV2_2.check<CheckResponseV3>({
		customer_id: customerId,
		entity_id: entities[0].id,
		feature_id: TestFeature.Messages,
	});
	const secondEntity = await autumnV2_2.check<CheckResponseV3>({
		customer_id: customerId,
		entity_id: entities[1].id,
		feature_id: TestFeature.Messages,
	});
	expect(firstEntity.balance?.granted).toBe(50);
	expect(secondEntity.balance?.granted).toBe(200);

	const poolsAfter = (await autumnV2_2.post("/licenses.list", {
		customer_id: customerId,
	})) as { list: LicenseBalanceResponse[] };
	expect(
		poolsAfter.list.find(
			(pool) => pool.parent_plan_id === poolA?.parent_plan_id,
		)?.inventory,
	).toMatchObject({ included: 1, assigned: 1, available: 0 });
	expect(
		poolsAfter.list.find(
			(pool) => pool.parent_plan_id === poolB?.parent_plan_id,
		)?.inventory,
	).toMatchObject({ included: 2, assigned: 1, available: 1 });
});

test(`${chalk.yellowBright("licenses-edge: non-license assign and priced customize are rejected")}`, async () => {
	const parent = makeParentProduct({ id: "license-negative-parent" });
	const license = makeLicenseProduct({ id: "license-negative-seat" });
	const { customerId, entities, autumnV2_2 } = await initScenario({
		customerId: "lic-edge-negative",
		setup: [
			s.customer({ testClock: false }),
			s.entities({ count: 1, featureId: TestFeature.Users }),
			s.products({ list: [parent, license] }),
		],
		actions: [s.billing.attach({ productId: parent.id })],
	});

	await autumnV2_2.post("/licenses.link", {
		parent_plan_id: parent.id,
		license_plan_id: license.id,
		included: 1,
	});
	await expectAutumnError({
		errCode: ErrCode.InvalidRequest,
		func: () =>
			autumnV2_2.post("/licenses.attach", {
				customer_id: customerId,
				entity_id: entities[0].id,
				plan_id: parent.id,
			}),
	});
	const pricedCustomize = (await autumnV2_2.post("/licenses.link", {
		parent_plan_id: parent.id,
		license_plan_id: license.id,
		included: 1,
		customize: { items: [itemsV2.prepaidMessages()] },
	})) as { plan_license: { customize: { add_items: unknown[] } } };
	expect(pricedCustomize.plan_license.customize.add_items).toHaveLength(1);

	const assignments = (await autumnV2_2.post("/licenses.list_assignments", {
		customer_id: customerId,
		plan_id: license.id,
	})) as { list: unknown[] };
	expect(assignments.list).toHaveLength(0);
});
