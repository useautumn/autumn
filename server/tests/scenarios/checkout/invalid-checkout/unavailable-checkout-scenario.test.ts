import { test } from "bun:test";
import { CheckoutErrorCode } from "@autumn/shared";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import {
	createAutumnCheckout,
	expectCheckoutErrorResponse,
	fetchCheckoutError,
	logInvalidCheckoutScenario,
	makeCheckoutUnavailable,
} from "./invalidCheckoutUtils";

test.concurrent(`${chalk.yellowBright("autumn-checkout: invalid - unavailable checkout")}`, async () => {
	const customerId = "checkout-invalid-unavailable";

	const pro = products.pro({
		id: "pro-invalid-unavailable",
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [],
	});

	const { checkoutId, checkoutUrl } = await createAutumnCheckout({
		autumnV1,
		customerId,
		productId: pro.id,
	});

	await makeCheckoutUnavailable({
		ctx,
		checkoutId,
	});

	const response = await fetchCheckoutError({
		checkoutId,
	});

	expectCheckoutErrorResponse({
		...response,
		code: CheckoutErrorCode.CheckoutUnavailable,
	});

	await logInvalidCheckoutScenario({
		label: "unavailable checkout scenario",
		checkoutUrl,
		autumnV1,
		customerId,
		...response,
	});
});
