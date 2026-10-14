import { expect, test } from "bun:test";
import type {
	ApiCustomerV3,
	UpdateSubscriptionV1ParamsInput,
} from "@autumn/shared";
import { findActiveCustomerProductById } from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { getSubscriptionId } from "@tests/integration/billing/utils/stripe/getSubscriptionId";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { CusService } from "@/internal/customers/CusService";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService";

const OWNER_KEY = "mismatched-sub-owner";

const setupForeignSubscriptionLink = async ({
	customerId,
	productId,
}: {
	customerId: string;
	productId: string;
}) => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const free = products.base({
		id: "free",
		items: [messagesItem],
		isDefault: true,
	});
	const pro = products.pro({ id: productId, items: [messagesItem] });

	const scenario = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.otherCustomers([{ id: OWNER_KEY, paymentMethod: "success" }]),
			s.products({ list: [free, pro] }),
		],
		actions: [
			s.attach({ productId: pro.id }),
			s.attach({ productId: pro.id, customerId: OWNER_KEY }),
		],
	});

	const { ctx, otherCustomers } = scenario;
	const ownerId = otherCustomers.get(OWNER_KEY)?.id;
	if (!ownerId) throw new Error("owner customer not created");

	const foreignSubscriptionId = await getSubscriptionId({
		ctx,
		customerId: ownerId,
		productId: pro.id,
	});

	const fullCustomer = await CusService.getFull({
		ctx,
		idOrInternalId: customerId,
	});
	const customerProduct = findActiveCustomerProductById({
		fullCus: fullCustomer,
		productId: pro.id,
	});
	if (!customerProduct) throw new Error("subject customer product missing");

	await CusProductService.update({
		ctx,
		cusProductId: customerProduct.id,
		updates: { subscription_ids: [foreignSubscriptionId] },
	});

	return { ...scenario, free, pro, ownerId, foreignSubscriptionId };
};

test(`${chalk.yellowBright("mismatched sub: cancel_immediately succeeds and leaves the foreign sub alone")}`, async () => {
	const customerId = "mismatched-sub-cancel-now";

	const { autumnV1, autumnV2_2, ctx, free, pro, foreignSubscriptionId } =
		await setupForeignSubscriptionLink({ customerId, productId: "pro" });

	const invoiceCountBefore =
		(await autumnV1.customers.get<ApiCustomerV3>(customerId)).invoices
			?.length ?? 0;

	await autumnV2_2.subscriptions.previewUpdate<UpdateSubscriptionV1ParamsInput>(
		{
			customer_id: customerId,
			plan_id: pro.id,
			cancel_action: "cancel_immediately",
		},
	);

	await autumnV2_2.billing.update<UpdateSubscriptionV1ParamsInput>({
		customer_id: customerId,
		plan_id: pro.id,
		cancel_action: "cancel_immediately",
	});

	await expectCustomerProducts({
		customer: await autumnV1.customers.get<ApiCustomerV3>(customerId),
		notPresent: [pro.id],
		active: [free.id],
	});

	await expectCustomerInvoiceCorrect({
		customer: await autumnV1.customers.get<ApiCustomerV3>(customerId),
		count: invoiceCountBefore,
	});

	const foreignSubscription = await ctx.stripeCli.subscriptions.retrieve(
		foreignSubscriptionId,
	);
	expect(foreignSubscription.status).toBe("active");
	expect(foreignSubscription.cancel_at_period_end).toBe(false);
	expect(foreignSubscription.canceled_at).toBeNull();
});

test(`${chalk.yellowBright("mismatched sub: a non-cancel update still rejects")}`, async () => {
	const customerId = "mismatched-sub-other-update";

	const { autumnV2_2, pro, foreignSubscriptionId } =
		await setupForeignSubscriptionLink({ customerId, productId: "pro" });

	await expectAutumnError({
		errMessage: `Subscription ${foreignSubscriptionId} is not for the current customer`,
		func: () =>
			autumnV2_2.billing.update<UpdateSubscriptionV1ParamsInput>({
				customer_id: customerId,
				plan_id: pro.id,
				cancel_action: "cancel_end_of_cycle",
			}),
	});
});
