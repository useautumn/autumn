import {
	customerLicenses,
	customerProducts,
	customers,
	type LicenseBalanceResponse,
	type PlanLicense,
} from "@autumn/shared";
import { and, eq, isNotNull } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import type { AutumnInt } from "@/external/autumn/autumnCli.js";

export type TestLicenseAssignment = {
	id: string;
	entity_id: string;
	license_plan_id: string;
	started_at: number;
	ended_at: number | null;
};

export const assignLicense = async ({
	autumn,
	customerId,
	entityId,
	licensePlanId,
	parentPlanId,
}: {
	autumn: AutumnInt;
	customerId: string;
	entityId: string;
	licensePlanId: string;
	parentPlanId?: string;
}) => {
	const response = (await autumn.post("/licenses.attach", {
		customer_id: customerId,
		entity_id: entityId,
		plan_id: licensePlanId,
		parent_plan_id: parentPlanId,
	})) as { assignment: TestLicenseAssignment };
	return response.assignment;
};

export const listLicensePools = async ({
	autumn,
	customerId,
	entityId,
}: {
	autumn: AutumnInt;
	customerId: string;
	entityId?: string;
}) => {
	const response = (await autumn.post("/licenses.list", {
		customer_id: customerId,
		entity_id: entityId,
	})) as { list: LicenseBalanceResponse[] };
	return response.list;
};

export const listLicenseAssignments = async ({
	autumn,
	customerId,
	entityId,
	licensePlanId,
	active,
}: {
	autumn: AutumnInt;
	customerId: string;
	entityId?: string;
	licensePlanId?: string;
	active?: boolean;
}) => {
	const response = (await autumn.post("/licenses.list_assignments", {
		customer_id: customerId,
		entity_id: entityId,
		plan_id: licensePlanId,
		active,
	})) as { list: TestLicenseAssignment[] };
	return response.list;
};

export const listLicenseLinks = async ({
	autumn,
	parentPlanId,
}: {
	autumn: AutumnInt;
	parentPlanId: string;
}) => {
	const response = (await autumn.post("/licenses.list_links", {
		parent_plan_id: parentPlanId,
	})) as { list: PlanLicense[] };
	return response.list;
};

export const getLicenseDbState = async ({
	db,
	customerId,
}: {
	db: DrizzleCli;
	customerId: string;
}) => {
	const customer = await db.query.customers.findFirst({
		where: eq(customers.id, customerId),
	});
	if (!customer) throw new Error(`Customer '${customerId}' not found`);

	const [assignments, pools, products] = await Promise.all([
		db.query.customerProducts.findMany({
			where: and(
				eq(customerProducts.internal_customer_id, customer.internal_id),
				isNotNull(customerProducts.license_parent_customer_product_id),
			),
		}),
		db.query.customerLicenses.findMany({
			where: eq(customerLicenses.internal_customer_id, customer.internal_id),
		}),
		db.query.customerProducts.findMany({
			where: eq(customerProducts.internal_customer_id, customer.internal_id),
		}),
	]);

	return { assignments, pools, products };
};
