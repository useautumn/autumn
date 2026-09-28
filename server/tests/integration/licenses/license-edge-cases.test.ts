import { expect, test } from "bun:test";
import {
	type ApiCustomerLicenseV0,
	type ApiEntityV2,
	type AttachParamsV1Input,
	type CheckResponseV3,
	ErrCode,
	fullCustomerToFullSubject,
	fullSubjectToApiCustomerProducts,
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
import { and, eq } from "drizzle-orm";
import { CusService } from "@/internal/customers/CusService.js";
import { getLicenseDbState } from "./licenseTestUtils.js";

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
}: {
	customerId: string;
	parentMessageGrant?: number;
	licenseMessageGrant?: number;
	included?: number;
	entityCount?: number;
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
		actions: [
			s.licenses.link({
				parentProductId: parent.id,
				licenseProductId: license.id,
				included,
			}),
			s.billing.attach({ productId: parent.id }),
			s.licenses.assign({
				licenseProductId: license.id,
				entityIndex: 0,
			}),
		],
	});

	return {
		...result,
		parent,
		license,
		assignment: result.licenseAssignments[0],
	};
};

const getBalanceBreakdown = (
	response: CheckResponseV3 | TrackResponseV3,
	planId: string,
) => response.balance?.breakdown?.find((item) => item.plan_id === planId);

test.concurrent(
	`${chalk.yellowBright("licenses-custom: attach upsert_licenses adds a license alongside the catalog")}`,
	async () => {
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

		await autumnV2_2.post("/plans.update", {
			plan_id: parent.id,
			licenses: [
				{
					license_plan_id: baseLicense.id,
					included: 1,
				},
			],
		});
		await autumnV2_2.billing.attach({
			customer_id: customerId,
			plan_id: parent.id,
			customize: {
				upsert_licenses: [
					{
						license_plan_id: customLicense.id,
						included: 2,
					},
				],
			},
		});

		const pools = (await autumnV2_2.post("/licenses.list", {
			customer_id: customerId,
		})) as { list: ApiCustomerLicenseV0[] };
		expect(pools.list).toHaveLength(2);
		expect(
			pools.list.find((pool) => pool.license_plan_id === customLicense.id),
		).toMatchObject({ granted: 2, usage: 0, remaining: 2 });
		expect(
			pools.list.find((pool) => pool.license_plan_id === baseLicense.id),
		).toMatchObject({ granted: 1, usage: 0, remaining: 1 });
	},
);

test.concurrent(
	`${chalk.yellowBright("licenses-custom: updateSubscription applies upsert_licenses")}`,
	async () => {
		const { customerId, autumnV2_2, ctx, parent, license } =
			await setupAssignedLicense({
				customerId: "lic-custom-preview",
				included: 1,
			});

		await autumnV2_2.billing.update<UpdateSubscriptionV1ParamsInput>({
			customer_id: customerId,
			plan_id: parent.id,
			customize: {
				upsert_licenses: [{ license_plan_id: license.id, included: 3 }],
			},
		});

		const pools = (await autumnV2_2.post("/licenses.list", {
			customer_id: customerId,
		})) as { list: ApiCustomerLicenseV0[] };
		expect(pools.list).toHaveLength(1);
		expect(pools.list[0]).toMatchObject({
			license_plan_id: license.id,
			granted: 3,
			usage: 1,
			remaining: 2,
		});

		const customRows = await ctx.db.query.planLicenses.findMany({
			where: and(
				eq(planLicenses.license_internal_product_id, license.internal_id!),
				eq(planLicenses.is_custom, true),
			),
		});
		expect(customRows).toHaveLength(1);
	},
);

test.concurrent(
	`${chalk.yellowBright("licenses-custom: attach transition moves assignments to custom pool")}`,
	async () => {
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
		const { customerId, entities, autumnV2_2 } = await initScenario({
			customerId: "lic-custom-switch",
			setup: [
				s.customer({ testClock: false }),
				s.entities({ count: 1, featureId: TestFeature.Users }),
				s.products({ list: [firstParent, secondParent, license] }),
			],
			actions: [s.billing.attach({ productId: firstParent.id })],
		});

		await autumnV2_2.post("/plans.update", {
			plan_id: firstParent.id,
			licenses: [
				{
					license_plan_id: license.id,
					included: 1,
				},
			],
		});
		await autumnV2_2.post("/licenses.attach", {
			customer_id: customerId,
			plan_id: license.id,
			entities: [{ entity_id: entities[0].id }],
		});

		await autumnV2_2.billing.attach<AttachParamsV1Input>({
			customer_id: customerId,
			plan_id: secondParent.id,
			customize: {
				upsert_licenses: [
					{
						license_plan_id: license.id,
						included: 1,
					},
				],
			},
		});

		const pools = (await autumnV2_2.post("/licenses.list", {
			customer_id: customerId,
		})) as { list: ApiCustomerLicenseV0[] };
		expect(pools.list).toHaveLength(1);
		expect(pools.list[0]).toMatchObject({
			license_plan_id: license.id,
			granted: 1,
			usage: 1,
			remaining: 0,
			assignments: [{ entity_id: entities[0].id }],
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("licenses-custom: active assignments block unsafe upsert reductions")}`,
	async () => {
		const { customerId, autumnV2_2, parent, license } =
			await setupAssignedLicense({
				customerId: "lic-custom-reduce-block",
				included: 1,
			});

		await expectAutumnError({
			errCode: ErrCode.InvalidRequest,
			errMessage: "License changes conflict with active license assignments",
			func: () =>
				autumnV2_2.billing.update<UpdateSubscriptionV1ParamsInput>({
					customer_id: customerId,
					plan_id: parent.id,
					customize: {
						upsert_licenses: [
							{
								license_plan_id: license.id,
								included: 0,
							},
						],
					},
				}),
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("licenses-edge: provisioned license stays entity-level internally and hidden from API products")}`,
	async () => {
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
		// Seats anchor to their pool by link; entitlements scope via the product row.
		const { pools } = await getLicenseDbState({ db: ctx.db, customerId });
		expect(licenseCusProduct?.customer_license_link_id).toBe(pools[0]?.link_id);
		expect(
			licenseCusProduct?.customer_entitlements.every(
				(entitlement) => entitlement.internal_entity_id === null,
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
	},
);

test.concurrent(
	`${chalk.yellowBright("licenses-edge: entity check stacks customer grant and license grant")}`,
	async () => {
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
	},
);

test.concurrent(
	`${chalk.yellowBright("licenses-edge: entity track deducts inherited and license balances")}`,
	async () => {
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
			trackResponse.deductions?.find((item) => item.plan_id === parent.id)
				?.value,
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
	},
);

test.concurrent(
	`${chalk.yellowBright("licenses-edge: customer and sibling entity cannot spend assigned license")}`,
	async () => {
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
		})) as { list: ApiCustomerLicenseV0[] };
		expect(pools.list[0]).toMatchObject({
			license_plan_id: license.id,
			usage: 1,
			remaining: 0,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("licenses-edge: duplicate assign is idempotent and does not double grant")}`,
	async () => {
		const { customerId, entities, autumnV2_2, assignment, license } =
			await setupAssignedLicense({
				customerId: "lic-edge-idempotent",
			});

		await autumnV2_2.post("/licenses.attach", {
			customer_id: customerId,
			plan_id: license.id,
			entities: [{ entity_id: entities[0].id }],
		});

		const assignments = (await autumnV2_2.post("/licenses.list_assignments", {
			customer_id: customerId,
			plan_id: license.id,
		})) as { list: (typeof assignment)[] };
		expect(assignments.list).toHaveLength(1);
		expect(assignments.list[0].id).toBe(assignment.id);
		expect(assignments.list[0].started_at).toBe(assignment.started_at);

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
	},
);

test.concurrent(
	`${chalk.yellowBright("licenses-edge: two assigned entities isolate license balances and share customer grant")}`,
	async () => {
		const { customerId, entities, autumnV2_2, parent, license } =
			await setupAssignedLicense({
				customerId: "lic-edge-two-entities",
				parentMessageGrant: 10,
				included: 2,
				entityCount: 2,
			});
		await autumnV2_2.post("/licenses.attach", {
			customer_id: customerId,
			plan_id: license.id,
			entities: [{ entity_id: entities[1].id }],
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
	},
);

test.concurrent(
	`${chalk.yellowBright("licenses-edge: release removes only the license grant and repeat release rejects")}`,
	async () => {
		const { customerId, entities, autumnV2_2, parent, license } =
			await setupAssignedLicense({
				customerId: "lic-edge-unassign",
				parentMessageGrant: 10,
			});

		const released = (await autumnV2_2.post("/licenses.release", {
			customer_id: customerId,
			entity_ids: [entities[0].id],
		})) as { success: boolean };
		expect(released.success).toBe(true);
		await expectAutumnError({
			errCode: ErrCode.InvalidRequest,
			func: () =>
				autumnV2_2.post("/licenses.release", {
					customer_id: customerId,
					entity_ids: [entities[0].id],
				}),
		});

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
	},
);

// attach's parent_plan_id was removed; multi-pool disambiguation is TBD in the current API.
test.todo(
	`${chalk.yellowBright("licenses-edge: multiple parent pools require subscription disambiguation")}`,
	() => {},
);

test.concurrent(
	`${chalk.yellowBright("licenses-edge: non-license assign and priced customize are rejected")}`,
	async () => {
		const parent = makeParentProduct({ id: "license-negative-parent" });
		const license = makeLicenseProduct({ id: "license-negative-seat" });
		const { customerId, entities, autumnV2_2, ctx } = await initScenario({
			customerId: "lic-edge-negative",
			setup: [
				s.customer({ testClock: false }),
				s.entities({ count: 1, featureId: TestFeature.Users }),
				s.products({ list: [parent, license] }),
			],
			actions: [s.billing.attach({ productId: parent.id })],
		});

		await autumnV2_2.post("/plans.update", {
			plan_id: parent.id,
			licenses: [{ license_plan_id: license.id, included: 1 }],
		});
		await expectAutumnError({
			errCode: ErrCode.InvalidRequest,
			func: () =>
				autumnV2_2.post("/licenses.attach", {
					customer_id: customerId,
					plan_id: parent.id,
					entities: [{ entity_id: entities[0].id }],
				}),
		});
		await autumnV2_2.billing.update<UpdateSubscriptionV1ParamsInput>({
			customer_id: customerId,
			plan_id: parent.id,
			customize: {
				upsert_licenses: [
					{
						license_plan_id: license.id,
						included: 1,
						customize: { add_items: [itemsV2.prepaidMessages()] },
					},
				],
			},
		});
		const customRows = await ctx.db.query.planLicenses.findMany({
			where: and(
				eq(planLicenses.license_internal_product_id, license.internal_id!),
				eq(planLicenses.is_custom, true),
			),
		});
		expect(customRows).toHaveLength(1);
		expect(customRows[0].customized).toBe(true);

		const assignments = (await autumnV2_2.post("/licenses.list_assignments", {
			customer_id: customerId,
			plan_id: license.id,
		})) as { list: unknown[] };
		expect(assignments.list).toHaveLength(0);
	},
);
