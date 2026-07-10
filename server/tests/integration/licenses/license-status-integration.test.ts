import { expect, test } from "bun:test";
import {
	CusProductStatus,
	ErrCode,
	type CheckResponseV3,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService.js";
import { deleteCachedFullCustomer } from "@/internal/customers/cusUtils/fullCustomerCacheUtils/deleteCachedFullCustomer.js";
import { getLicenseDbState } from "./licenseTestUtils.js";

const setupStatusScenario = async (customerId: string) => {
	const parent = products.base({
		id: `${customerId}-parent`,
		items: [items.dashboard()],
	});
	const license = products.base({
		id: `${customerId}-license`,
		items: [items.monthlyMessages({ includedUsage: 25 })],
	});
	const scenario = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: false }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
			s.products({ list: [parent, license] }),
		],
		actions: [s.billing.attach({ productId: parent.id })],
	});
	await scenario.autumnV2_2.post("/licenses.link", {
		parent_plan_id: parent.id,
		license_plan_id: license.id,
		included: 2,
	});
	await scenario.autumnV2_2.post("/licenses.attach", {
		customer_id: customerId,
		entity_id: scenario.entities[0].id,
		plan_id: license.id,
	});
	return { ...scenario, license };
};

const setParentStatus = async ({
	ctx,
	customerId,
	status,
}: {
	ctx: Awaited<ReturnType<typeof setupStatusScenario>>["ctx"];
	customerId: string;
	status: CusProductStatus;
}) => {
	const state = await getLicenseDbState({ db: ctx.db, customerId });
	const parent = state.products.find(
		(customerProduct) =>
			customerProduct.license_parent_customer_product_id === null &&
			customerProduct.internal_entity_id === null,
	);
	if (!parent) throw new Error("License parent not found");
	await CusProductService.update({
		ctx,
		cusProductId: parent.id,
		updates: { status },
	});
	await deleteCachedFullCustomer({ ctx, customerId, skipGuard: true });
};

test.concurrent(
	`${chalk.yellowBright("licenses status: past-due retains grants but blocks new assignments until recovery")}`,
	async () => {
		const { customerId, entities, autumnV2_2, ctx, license } =
			await setupStatusScenario("license-parent-past-due");
		await setParentStatus({
			ctx,
			customerId,
			status: CusProductStatus.PastDue,
		});

		const existing = await autumnV2_2.check<CheckResponseV3>({
			customer_id: customerId,
			entity_id: entities[0].id,
			feature_id: TestFeature.Messages,
			skip_cache: true,
		});
		expect(existing.allowed).toBe(true);
		await expectAutumnError({
			errCode: ErrCode.InvalidRequest,
			func: () =>
				autumnV2_2.post("/licenses.attach", {
					customer_id: customerId,
					entity_id: entities[1].id,
					plan_id: license.id,
				}),
		});

		await setParentStatus({ ctx, customerId, status: CusProductStatus.Active });
		await autumnV2_2.post("/licenses.attach", {
			customer_id: customerId,
			entity_id: entities[1].id,
			plan_id: license.id,
		});
		const state = await getLicenseDbState({ db: ctx.db, customerId });
		expect(
			state.assignments.filter(({ status }) => status === "active"),
		).toHaveLength(2);
		expect(state.pools[0]).toMatchObject({ granted: 2, remaining: 0 });
	},
);

test.concurrent(
	`${chalk.yellowBright("licenses status: true trialing parent retains grants but is not assignable")}`,
	async () => {
		const { customerId, entities, autumnV2_2, ctx, license } =
			await setupStatusScenario("license-parent-true-trialing");
		await setParentStatus({
			ctx,
			customerId,
			status: CusProductStatus.Trialing,
		});

		expect(
			(
				await autumnV2_2.check<CheckResponseV3>({
					customer_id: customerId,
					entity_id: entities[0].id,
					feature_id: TestFeature.Messages,
					skip_cache: true,
				})
			).allowed,
		).toBe(true);
		await expectAutumnError({
			errCode: ErrCode.InvalidRequest,
			func: () =>
				autumnV2_2.post("/licenses.attach", {
					customer_id: customerId,
					entity_id: entities[1].id,
					plan_id: license.id,
				}),
		});
	},
);
