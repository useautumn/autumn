import { expect } from "bun:test";
import {
	type AttachParamsV1Input,
	CusProductStatus,
	customers,
} from "@autumn/shared";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import { eq } from "drizzle-orm";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService";

const CHECKOUT_BASE_URL =
	process.env.AUTUMN_TEST_BASE_URL ?? "http://localhost:8080";
const STRIPE_SESSION_ID_REGEX = /cs_(test|live)_[A-Za-z0-9]+/;

export const getLongLivedCheckoutId = (
	paymentUrl: string | null | undefined,
) => {
	if (!paymentUrl) throw new Error("Expected payment_url");
	const checkoutId = paymentUrl.split("/co/")[1];
	if (!checkoutId) {
		throw new Error(`Expected long-lived checkout URL: ${paymentUrl}`);
	}
	return checkoutId;
};

export const requestLongLivedCheckoutStart = (checkoutId: string) =>
	fetch(`${CHECKOUT_BASE_URL}/checkouts/${checkoutId}/start`, {
		redirect: "manual",
	});

export const startLongLivedCheckout = async (checkoutId: string) => {
	const response = await requestLongLivedCheckoutStart(checkoutId);
	expect(response.status).toBe(303);
	const location = response.headers.get("location");
	expect(location).toContain("checkout.stripe.com");
	return location!;
};

export const getStripeSessionId = (url: string) => {
	const sessionId = url.match(STRIPE_SESSION_ID_REGEX)?.[0];
	if (!sessionId) throw new Error(`Expected Stripe checkout URL: ${url}`);
	return sessionId;
};

type ScenarioCtx = Awaited<ReturnType<typeof initScenario>>["ctx"];

export const setupLongLivedScenario = async ({
	customerId,
	enablePlanImmediately,
	withTrial = false,
}: {
	customerId: string;
	enablePlanImmediately: boolean;
	withTrial?: boolean;
}) => {
	const productItems = [items.monthlyMessages({ includedUsage: 100 })];
	const pro = withTrial
		? products.proWithTrial({ id: `pro-${customerId}`, items: productItems })
		: products.pro({ id: `pro-${customerId}`, items: productItems });

	const scenario = await initScenario({
		customerId,
		setup: [s.customer({ testClock: true }), s.products({ list: [pro] })],
		actions: [],
	});

	const dbCustomer = await scenario.ctx.db.query.customers.findFirst({
		where: eq(customers.id, customerId),
	});

	const result = await scenario.autumnV2_2.billing.attach<AttachParamsV1Input>({
		customer_id: customerId,
		plan_id: pro.id,
		long_lived_checkout: true,
		enable_plan_immediately: enablePlanImmediately,
	});

	return {
		...scenario,
		pro,
		internalCustomerId: dbCustomer!.internal_id,
		checkoutId: getLongLivedCheckoutId(result.payment_url),
	};
};

export const findCustomerProductRow = async ({
	ctx,
	internalCustomerId,
	productId,
	status = CusProductStatus.Active,
}: {
	ctx: ScenarioCtx;
	internalCustomerId: string;
	productId: string;
	status?: CusProductStatus;
}) => {
	const rows = await CusProductService.list({
		db: ctx.db,
		internalCustomerId,
		inStatuses: [status],
	});
	return rows.find((row) => row.product.id === productId);
};
