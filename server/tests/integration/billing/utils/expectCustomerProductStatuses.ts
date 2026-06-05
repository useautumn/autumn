import { expect } from "bun:test";
import {
	CusProductStatus,
	type FullCusProduct,
	type CusProductStatus as CusProductStatusType,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { CusService } from "@/internal/customers/CusService";

type CustomerProductStatusesResult = {
	customerProducts: FullCusProduct[];
	byStatus: Partial<Record<CusProductStatusType, FullCusProduct[]>>;
};

export const expectCustomerProductStatuses = async ({
	ctx,
	customerId,
	productId,
	entityId,
	expected,
}: {
	ctx: AutumnContext;
	customerId: string;
	productId: string;
	entityId?: string;
	expected: Partial<Record<CusProductStatusType, number>>;
}): Promise<CustomerProductStatusesResult> => {
	const fullCustomer = await CusService.getFull({
		ctx,
		idOrInternalId: customerId,
		inStatuses: [
			CusProductStatus.Active,
			CusProductStatus.PastDue,
			CusProductStatus.Scheduled,
			CusProductStatus.Expired,
		],
		withEntities: true,
	});

	const customerProducts = fullCustomer.customer_products.filter(
		(customerProduct) =>
			customerProduct.product_id === productId &&
			(entityId ? customerProduct.entity_id === entityId : true),
	);

	const byStatus = customerProducts.reduce<
		Partial<Record<CusProductStatusType, FullCusProduct[]>>
	>((acc, customerProduct) => {
		acc[customerProduct.status] = [
			...(acc[customerProduct.status] ?? []),
			customerProduct,
		];
		return acc;
	}, {});

	for (const [status, count] of Object.entries(expected)) {
		const matchingCustomerProducts =
			byStatus[status as CusProductStatusType] ?? [];

		expect(
			matchingCustomerProducts.length,
			`Expected ${count} ${status} rows for ${productId}; got ${JSON.stringify(
				customerProducts.map((customerProduct) => ({
					id: customerProduct.id,
					status: customerProduct.status,
					version: customerProduct.product.version,
				})),
			)}`,
		).toBe(count);
	}

	return { customerProducts, byStatus };
};
