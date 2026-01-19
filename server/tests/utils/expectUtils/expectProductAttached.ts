import { expect } from "bun:test";
import {
	type ApiCustomer,
	type ApiEntityV0,
	type ApiEntityV1,
	type ApiSubscription,
	ApiVersion,
	type CreateFreeTrial,
	CusProductStatus,
	type Entitlement,
	type ProductV2,
} from "@autumn/shared";
import type {
	Customer,
	CustomerInvoice,
	ProductItem,
	ProductStatus,
} from "autumn-js";
import { AutumnInt } from "../../../src/external/autumn/autumnCli";

export const expectProductAttached = ({
	customer,
	product,
	productId,
	status,
	entityId,
	isCanceled = false,
	quantity,
}: {
	customer: Customer | ApiEntityV0;
	product?: ProductV2;
	productId?: string;
	status?: CusProductStatus;
	entityId?: string;
	isCanceled?: boolean;
	quantity?: number;
}) => {
	const cusProducts = customer.products ?? [];
	const finalProductId = productId || product?.id;
	const productAttached = cusProducts.find(
		(p) => p.id === finalProductId,
		// && (entityId ? p.entity_id === entityId : true),
	);

	expect(
		productAttached,
		`product ${finalProductId} not attached to ${customer.id}`,
	).toBeDefined();

	if (status) {
		expect(
			productAttached?.status,
			`product ${finalProductId} should have status ${status}`,
		).toEqual(status as unknown as ProductStatus);
	} else {
		expect(
			productAttached?.status,
			`product ${finalProductId} is not expired`,
		).not.toEqual(CusProductStatus.Expired);
	}

	if (quantity) {
		expect(
			// biome-ignore lint/suspicious/noExplicitAny: Allow any type
			(productAttached as any).quantity,
			`product ${finalProductId} should have quantity ${quantity}`,
		).toEqual(quantity);
	}

	if (isCanceled) {
		expect(
			productAttached?.canceled_at,
			`product ${finalProductId} should have canceled_at`,
		).toBeDefined();
	}
};
export const expectProductNotAttached = ({
	customer,
	product,
	productId,
}: {
	customer: Customer;
	product?: ProductV2;
	productId?: string;
}) => {
	const cusProducts = customer.products;
	const finalProductId = productId || product?.id;
	const productAttached = cusProducts.find(
		(p) => p.id === finalProductId,
		// && (entityId ? p.entity_id === entityId : true),
	);

	expect(
		productAttached,
		`product ${finalProductId} is not attached to ${customer.id}`,
	).toBeUndefined();
};

export const expectProductGroupCount = ({
	customer,
	group,
	count,
}: {
	customer: Customer;
	group: string;
	count: number;
}) => {
	const productCount = customer.products.reduce((acc: number, product: any) => {
		if (product.group === group) {
			return acc + 1;
		} else return acc;
	}, 0);

	expect(
		productCount,
		`customer should have ${count} products in group ${group}`,
	).toEqual(count);
};

export const expectScheduledApiSub = async ({
	customerId,
	entityId,
	productId,
}: {
	customerId: string;
	entityId?: string;
	productId: string;
}) => {
	const autumnV2 = new AutumnInt({
		version: ApiVersion.V2_0,
		secretKey: process.env.UNIT_TEST_AUTUMN_SECRET_KEY,
	});

	const entity = entityId
		? await autumnV2.entities.get<ApiEntityV1>(customerId, entityId)
		: await autumnV2.customers.get<ApiCustomer>(customerId);

	const scheduledSub = entity.scheduled_subscriptions.find(
		(s: ApiSubscription) => s.plan_id === productId,
	);
	expect(
		scheduledSub,
		`scheduled subscription ${productId} is attached`,
	).toBeDefined();
};

export const expectProductV1Attached = ({
	customer,
	product,
	productId,
	status,
	entityId,
}: {
	customer: Customer;
	product: {
		id: string;
		isDefault?: boolean;
		isAddOn?: boolean;
		items?: Record<string, ProductItem>;
		entitlements: Record<string, Entitlement>;
		prices: any[];
		freeTrial?: CreateFreeTrial;
		group?: string;
	};
	productId?: string;
	status?: CusProductStatus;
	entityId?: string;
}) => {
	const cusProducts = customer.products;
	const finalProductId = productId || product?.id;
	const productAttached = cusProducts.find(
		(p) =>
			p.id === finalProductId && (entityId ? p.entity_id === entityId : true),
	);

	expect(
		productAttached,
		`product ${finalProductId} is attached`,
	).toBeDefined();

	if (status) {
		expect(
			productAttached?.status,
			`product ${finalProductId} should have status ${status}`,
		).toEqual(status as unknown as ProductStatus);
	}
};

export const expectAddOnAttached = ({
	customer,
	productId,
	status,
}: {
	customer: Customer & {
		add_ons: {
			id: string;
			status: CusProductStatus;
		}[];
	};
	productId: string;
	status?: CusProductStatus;
}) => {
	const addOn = customer.add_ons.find((a) => a.id === productId);
	expect(addOn, `add on ${productId} is attached`).toBeDefined();

	if (status) {
		expect(
			addOn?.status,
			`add on ${productId} should have status ${status}`,
		).toEqual(status as unknown as CusProductStatus);
	}
};

export const expectInvoicesCorrect = ({
	customer,
	first,
	// second,
}: {
	customer: Customer & { invoices: CustomerInvoice[] };
	first: {
		productId: string;
		total: number;
	};
	// second?: {
	//   productId: string;
	//   total: number;
	// };
}) => {
	const invoices = customer.invoices;
	if (!invoices) {
		console.log(`invoices is nullish`);
	}

	try {
		expect(
			invoices![0].total,
			`invoice total is correct: ${first.total}`,
		).toBeCloseTo(first.total, 0.01);

		expect(
			invoices![0].product_ids,
			`invoice includes product ${first.productId}`,
		).toContain(first.productId);
	} catch (error) {
		console.log(`invoice for ${first.productId}, ${first.total} not found`);
		throw error;
	}
};
