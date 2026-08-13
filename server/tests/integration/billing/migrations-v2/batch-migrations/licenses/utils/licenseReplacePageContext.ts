import {
	customerEntitlements,
	type EntitlementWithFeature,
	entitlements,
} from "@autumn/shared";
import { getLicenseDbState } from "@tests/integration/licenses/licenseTestUtils";
import { and, eq } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { buildOperationScope } from "@/internal/migrations/v2/batchOperations/scope/operationScope.js";
import { EntitlementService } from "@/internal/products/entitlements/EntitlementService.js";
import { generateId } from "@/utils/genUtils.js";

export const licenseReplacePageContext = async ({
	db,
	customerId,
}: {
	db: DrizzleCli;
	customerId: string;
}) => {
	const { assignments, pools, products } = await getLicenseDbState({
		db,
		customerId,
	});
	const parent = products.find(
		(product) => product.customer_license_link_id == null,
	);
	const pool = pools[0];
	if (!parent || !pool?.plan_license_id) {
		throw new Error(`license replace page context missing parent or pool`);
	}

	return {
		internalCustomerId: parent.internal_customer_id,
		scope: buildOperationScope({
			internalProductId: parent.internal_product_id,
		}),
		licenseInternalProductId: pool.license_internal_product_id,
		planLicenseId: pool.plan_license_id,
		liveAssignments: assignments.filter(
			(assignment) => assignment.internal_entity_id,
		),
		parent,
		pool,
	};
};

export const loadEntitlementWithFeature = async ({
	db,
	id,
}: {
	db: DrizzleCli;
	id: string;
}): Promise<EntitlementWithFeature> => {
	const row = await db.query.entitlements.findFirst({
		where: eq(entitlements.id, id),
		with: { feature: true },
	});
	if (!row?.feature) {
		throw new Error(`entitlement ${id} missing feature`);
	}
	return { ...row, feature: row.feature } as EntitlementWithFeature;
};

export const cloneAssignmentEntitlement = async ({
	db,
	customerProductId,
	featureId,
	overrides,
}: {
	db: DrizzleCli;
	customerProductId: string;
	featureId: string;
	overrides?: Partial<EntitlementWithFeature>;
}): Promise<EntitlementWithFeature> => {
	const [live] = await db
		.select()
		.from(customerEntitlements)
		.where(
			and(
				eq(customerEntitlements.customer_product_id, customerProductId),
				eq(customerEntitlements.feature_id, featureId),
			),
		)
		.limit(1);
	if (!live) throw new Error(`no customer_entitlement on ${customerProductId}`);

	const source = await loadEntitlementWithFeature({
		db,
		id: live.entitlement_id,
	});
	const { feature: _feature, ...rest } = source;
	const clonedId = generateId("ent");
	await EntitlementService.insert({
		db,
		data: {
			...rest,
			...overrides,
			id: clonedId,
			is_custom: true,
		},
	});
	await db
		.update(customerEntitlements)
		.set({ entitlement_id: clonedId })
		.where(eq(customerEntitlements.id, live.id));

	return loadEntitlementWithFeature({ db, id: clonedId });
};

export const mintEntitlement = async ({
	db,
	from,
	overrides,
}: {
	db: DrizzleCli;
	from: EntitlementWithFeature;
	overrides?: Partial<EntitlementWithFeature>;
}): Promise<EntitlementWithFeature> => {
	const { feature: _feature, ...rest } = from;
	const mintedId = generateId("ent");
	await EntitlementService.insert({
		db,
		data: {
			...rest,
			...overrides,
			id: mintedId,
			is_custom: true,
		},
	});
	return loadEntitlementWithFeature({ db, id: mintedId });
};
