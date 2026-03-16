import { expect } from "bun:test";
import {
	type ApiCustomerV3,
	CheckoutErrorCode,
	CheckoutStatus,
} from "@autumn/shared";
import { deleteCheckoutCache } from "@/internal/checkouts/actions/cache";
import { checkoutRepo } from "@/internal/checkouts/repos/checkoutRepo";

const CHECKOUT_BASE_URL = "http://localhost:8080";

export const createAutumnCheckout = async ({
	autumnV1,
	customerId,
	productId,
}: {
	autumnV1: {
		billing: {
			attach: (params: {
				customer_id: string;
				product_id: string;
				redirect_mode: "always";
			}) => Promise<{ payment_url: string | null }>;
		};
		customers: {
			get: <T>(customerId: string) => Promise<T>;
		};
	};
	customerId: string;
	productId: string;
}) => {
	const result = await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: productId,
		redirect_mode: "always",
	});

	expect(result.payment_url).toBeDefined();
	expect(result.payment_url).toContain("/c/");

	const checkoutId = result.payment_url!.split("/c/")[1];

	return {
		checkoutId,
		checkoutUrl: result.payment_url!,
	};
};

export const fetchCheckoutError = async ({
	checkoutId,
}: {
	checkoutId: string;
}) => {
	const response = await fetch(`${CHECKOUT_BASE_URL}/checkouts/${checkoutId}`, {
		signal: AbortSignal.timeout(15000),
	});
	const body = await response.json();

	return {
		status: response.status,
		body,
	};
};

export const markCheckoutCompleted = async ({
	ctx,
	checkoutId,
}: {
	ctx: { db: unknown };
	checkoutId: string;
}) => {
	await deleteCheckoutCache({ checkoutId });
	await checkoutRepo.update({
		db: ctx.db as never,
		id: checkoutId,
		updates: {
			status: CheckoutStatus.Completed,
			completed_at: Date.now(),
		},
	});
};

export const markCheckoutExpired = async ({
	ctx,
	checkoutId,
}: {
	ctx: { db: unknown };
	checkoutId: string;
}) => {
	await deleteCheckoutCache({ checkoutId });
	await checkoutRepo.update({
		db: ctx.db as never,
		id: checkoutId,
		updates: {
			status: CheckoutStatus.Expired,
			expires_at: Date.now() - 1000,
		},
	});
};

export const makeCheckoutUnavailable = async ({
	ctx,
	checkoutId,
}: {
	ctx: { db: unknown };
	checkoutId: string;
}) => {
	await deleteCheckoutCache({ checkoutId });
	await checkoutRepo.delete({
		db: ctx.db as never,
		id: checkoutId,
	});
};

export const expectCheckoutErrorResponse = ({
	status,
	body,
	code,
}: {
	status: number;
	body: {
		message?: string;
		code?: string;
	};
	code:
		| typeof CheckoutErrorCode.CheckoutCompleted
		| typeof CheckoutErrorCode.CheckoutExpired
		| typeof CheckoutErrorCode.CheckoutUnavailable;
}) => {
	expect(body.code).toBe(code);

	switch (code) {
		case CheckoutErrorCode.CheckoutCompleted:
			expect(status).toBe(409);
			break;
		case CheckoutErrorCode.CheckoutExpired:
			expect(status).toBe(410);
			break;
		case CheckoutErrorCode.CheckoutUnavailable:
			expect(status).toBe(404);
			break;
	}
};

export const logInvalidCheckoutScenario = async ({
	label,
	checkoutUrl,
	autumnV1,
	customerId,
	status,
	body,
}: {
	label: string;
	checkoutUrl: string;
	autumnV1: {
		customers: {
			get: <T>(customerId: string) => Promise<T>;
		};
	};
	customerId: string;
	status: number;
	body: unknown;
}) => {
	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	console.log(label, {
		checkoutUrl,
		status,
		body,
		products: customer.products?.map((product) => ({
			id: product.id,
			status: product.status,
		})),
	});
};
