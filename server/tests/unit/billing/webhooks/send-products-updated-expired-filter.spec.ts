/**
 * Proves that sendProductsUpdated drops the webhook for expired cusProducts.
 *
 * Root cause: immediate upgrades via attach set the old product to status=Expired
 * (computeAttachTransitionUpdates.ts L49). The worker then calls CusService.getFull
 * with default inStatuses=RELEVANT_STATUSES=[Active, PastDue, Scheduled], which
 * excludes Expired products. findCustomerProductById returns undefined -> webhook dropped.
 *
 * This accounts for ~98% of the ~1,300 daily "Customer product not found" warnings.
 */

import { describe, expect, mock, test } from "bun:test";
import {
	AttachScenario,
	CusProductStatus,
	RELEVANT_STATUSES,
} from "@autumn/shared";
import { contexts } from "@tests/utils/fixtures/db/contexts";
import { customerProducts } from "@tests/utils/fixtures/db/customerProducts";
import { customers } from "@tests/utils/fixtures/db/customers";
import { products } from "@tests/utils/fixtures/db/products";
import chalk from "chalk";
import { CusService } from "@/internal/customers/CusService";
import { sendProductsUpdated } from "@/internal/billing/v2/workflows/sendProductsUpdated/sendProductsUpdated";
import type { SendProductsUpdatedPayload } from "@/queue/workflows";

const mockSendSvixEvent = mock(() => Promise.resolve());
mock.module("@/external/svix/svixHelpers.js", () => ({
	sendSvixEvent: mockSendSvixEvent,
}));

mock.module(
	"@/internal/customers/cusUtils/apiCusUtils/getApiCustomerBase.js",
	() => ({
		getApiCustomerBase: mock(() =>
			Promise.resolve({
				apiCustomer: { id: "cus_test", balances: [], subscriptions: [] },
				legacyData: { cusProductLegacyData: {} },
			}),
		),
	}),
);

mock.module(
	"@/internal/products/productUtils/productResponseUtils/getPlanResponse.js",
	() => ({
		getPlanResponse: mock(() =>
			Promise.resolve({
				id: "prod_hobby",
				name: "Hobby",
				description: null,
				group: null,
				version: 1,
				is_add_on: false,
				is_default: false,
				auto_enable: false,
				items: [],
				price: null,
			}),
		),
	}),
);

describe(
	chalk.yellowBright(
		"sendProductsUpdated: expired cusProduct filtered by inStatuses",
	),
	() => {
		test("Expired status is NOT in RELEVANT_STATUSES (precondition)", () => {
			expect(RELEVANT_STATUSES).not.toContain(CusProductStatus.Expired);
			expect(RELEVANT_STATUSES).toContain(CusProductStatus.Active);
			expect(RELEVANT_STATUSES).toContain(CusProductStatus.Scheduled);
		});

		test("cancel webhook should fire when old product was set to Expired by attach upgrade", async () => {
			const expiredHobby = customerProducts.create({
				id: "cus_prod_hobby",
				productId: "prod_hobby",
				product: products.createFull({ id: "prod_hobby" }),
				status: CusProductStatus.Expired,
			});

			const activePro = customerProducts.create({
				id: "cus_prod_pro",
				productId: "prod_pro",
				product: products.createFull({ id: "prod_pro" }),
				status: CusProductStatus.Active,
			});

			// With ALL_STATUSES, getFull now returns the Expired product too
			const customerFromDb = customers.create({
				customerProducts: [expiredHobby, activePro],
			});

			const originalGetFull = CusService.getFull;
			CusService.getFull = mock(() =>
				Promise.resolve(customerFromDb),
			) as typeof CusService.getFull;

			const ctx = { ...contexts.create({}), expand: [], scopes: [] };
			const payload: SendProductsUpdatedPayload = {
				orgId: "org_test",
				env: ctx.env,
				customerId: "cus_test",
				customerProductId: "cus_prod_hobby",
				scenario: AttachScenario.Cancel,
			};

			mockSendSvixEvent.mockClear();

			await sendProductsUpdated({ ctx, payload });

			expect(mockSendSvixEvent).toHaveBeenCalledTimes(1);

			CusService.getFull = originalGetFull;
		});

		test("Active product webhook works fine (control case)", async () => {
			const activePro = customerProducts.create({
				id: "cus_prod_pro",
				productId: "prod_pro",
				product: products.createFull({ id: "prod_pro" }),
				status: CusProductStatus.Active,
			});

			const customerFromDb = customers.create({
				customerProducts: [activePro],
			});

			const originalGetFull = CusService.getFull;
			CusService.getFull = mock(() =>
				Promise.resolve(customerFromDb),
			) as typeof CusService.getFull;

			const ctx = { ...contexts.create({}), expand: [], scopes: [] };
			const payload: SendProductsUpdatedPayload = {
				orgId: "org_test",
				env: ctx.env,
				customerId: "cus_test",
				customerProductId: "cus_prod_pro",
				scenario: AttachScenario.Upgrade,
			};

			mockSendSvixEvent.mockClear();

			await sendProductsUpdated({ ctx, payload });

			expect(mockSendSvixEvent).toHaveBeenCalledTimes(1);

			CusService.getFull = originalGetFull;
		});
	},
);
