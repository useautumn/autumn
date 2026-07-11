import { expect, test } from "bun:test";
import { BillingInterval, ErrCode } from "@autumn/shared";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { ProductService } from "@/internal/products/ProductService.js";
import { listLicenseLinks } from "../licenseTestUtils.js";

test.concurrent(
	`${chalk.yellowBright("licenses catalog: versioning a parent to an incompatible interval is rejected and does not create a new version")}`,
	async () => {
		const parent = products.base({
			id: "version-reject-parent",
			items: [items.monthlyPrice({ price: 20 })],
		});
		const license = products.base({
			id: "version-reject-license",
			items: [items.monthlyPrice({ price: 30 })],
		});

		const { autumnV2_2, ctx } = await initScenario({
			customerId: "license-version-reject",
			setup: [
				s.customer({ paymentMethod: "success", testClock: false }),
				s.products({ list: [parent, license] }),
			],
			actions: [
				s.licenses.link({
					parentProductId: parent.id,
					licenseProductId: license.id,
					included: 1,
				}),
				s.billing.attach({ productId: parent.id }),
			],
		});

		const parentV1 = await ProductService.getFull({
			db: ctx.db,
			idOrInternalId: parent.id,
			orgId: ctx.org.id,
			env: ctx.env,
		});
		expect(parentV1.version).toBe(1);

		await expectAutumnError({
			errCode: ErrCode.InvalidRequest,
			errMessage: "Billing intervals must match",
			func: () =>
				autumnV2_2.post(`/products/${parent.id}`, {
					price: { amount: 240, interval: BillingInterval.Year },
				}),
		});

		const parentAfter = await ProductService.getFull({
			db: ctx.db,
			idOrInternalId: parent.id,
			orgId: ctx.org.id,
			env: ctx.env,
		});
		expect(parentAfter.version).toBe(1);
		expect(parentAfter.internal_id).toBe(parentV1.internal_id);
	},
);

test.concurrent(
	`${chalk.yellowBright("licenses catalog: in-place edits cannot invalidate a linked billing interval")}`,
	async () => {
		const parent = products.base({
			id: "in-place-interval-parent",
			items: [items.monthlyPrice({ price: 20 })],
		});
		const license = products.base({
			id: "in-place-interval-license",
			items: [items.monthlyPrice({ price: 30 })],
		});
		const { autumnV2_2, ctx } = await initScenario({
			customerId: "license-in-place-interval",
			setup: [
				s.customer({ paymentMethod: "success", testClock: false }),
				s.products({ list: [parent, license] }),
			],
			actions: [
				s.licenses.link({
					parentProductId: parent.id,
					licenseProductId: license.id,
					included: 1,
				}),
			],
		});

		for (const product of [parent, license]) {
			const before = await ProductService.getFull({
				db: ctx.db,
				idOrInternalId: product.id,
				orgId: ctx.org.id,
				env: ctx.env,
			});
			await expectAutumnError({
				errCode: ErrCode.InvalidRequest,
				errMessage: "Billing intervals must match",
				func: () =>
					autumnV2_2.post(`/products/${product.id}`, {
						price: { amount: 240, interval: BillingInterval.Year },
					}),
			});
			const after = await ProductService.getFull({
				db: ctx.db,
				idOrInternalId: product.id,
				orgId: ctx.org.id,
				env: ctx.env,
			});
			expect(after.internal_id).toBe(before.internal_id);
			expect(after.version).toBe(before.version);
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("licenses catalog: list_links returns every link with its included quantity")}`,
	async () => {
		const parent = products.base({
			id: "list-links-parent",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const seatLicense = products.base({
			id: "list-links-seat",
			items: [items.monthlyMessages({ includedUsage: 25 })],
		});
		const supportLicense = products.base({
			id: "list-links-support",
			items: [items.monthlyMessages({ includedUsage: 50 })],
		});

		const { autumnV2_2 } = await initScenario({
			customerId: "license-list-links-mix",
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [parent, seatLicense, supportLicense] }),
			],
			actions: [
				s.licenses.link({
					parentProductId: parent.id,
					licenseProductId: seatLicense.id,
					included: 2,
				}),
				s.licenses.link({
					parentProductId: parent.id,
					licenseProductId: supportLicense.id,
					included: 3,
				}),
				s.billing.attach({ productId: parent.id }),
			],
		});

		const list = await listLicenseLinks({
			autumn: autumnV2_2,
			parentPlanId: parent.id,
		});
		expect(list).toHaveLength(2);

		const seat = list.find((row) => row.license_plan_id === seatLicense.id);
		const support = list.find(
			(row) => row.license_plan_id === supportLicense.id,
		);

		expect(seat).toMatchObject({ included: 2 });
		expect(support).toMatchObject({ included: 3 });
	},
);
