import { expect, test } from "bun:test";
import { type ApiCustomerV3, ApiVersion } from "@autumn/shared";
import type { ApiCustomerV5 } from "@shared/api/customers/apiCustomerV5";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";

const SEARCH = "list-entity-license-balances";

test.concurrent(
	`${chalk.yellowBright("list-customers-entity-license-balances: entity-scoped balances pool into list, license assignments stay invisible")}`,
	async () => {
		const entityPro = products.pro({
			id: "lelb-entity-pro",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const licenseParent = products.pro({
			id: "lelb-license-parent",
			items: [items.dashboard()],
		});
		const seatLicense = products.base({
			id: "lelb-seat-license",
			items: [items.monthlyWords({ includedUsage: 25 })],
		});

		const { customerId } = await initScenario({
			customerId: SEARCH,
			setup: [
				s.customer({ paymentMethod: "success", testClock: false }),
				s.entities({ count: 2, featureId: TestFeature.Users }),
				s.products({ list: [entityPro, licenseParent, seatLicense] }),
			],
			actions: [
				s.licenses.link({
					parentProductId: licenseParent.id,
					licenseProductId: seatLicense.id,
					included: 3,
				}),
				s.billing.attach({ productId: licenseParent.id }),
				s.attach({ productId: entityPro.id, entityIndex: 0 }),
				s.licenses.assign({
					licenseProductId: seatLicense.id,
					entityIndex: 1,
				}),
			],
		});

		const autumnV1 = new AutumnInt({ version: ApiVersion.V1_2 });
		const autumnV2_3 = new AutumnInt({ version: ApiVersion.V2_3 });

		const v23 = (await autumnV2_3.customers.listV2({
			start_cursor: "",
			limit: 25,
			search: SEARCH,
			keepInternalFields: true,
		})) as { list: ApiCustomerV5[] };

		const v23Customer = v23.list.find((c) => c.id === customerId);
		expect(v23Customer).toBeDefined();

		const messages = v23Customer!.balances[TestFeature.Messages];
		expect(messages).toBeDefined();
		expect(messages!.granted).toBe(100);

		expect(v23Customer!.balances[TestFeature.Words]).toBeUndefined();

		expect(v23Customer!.flags[TestFeature.Dashboard]).toBeDefined();

		const v12 = (await autumnV1.customers.listV2({
			limit: 25,
			offset: 0,
			search: SEARCH,
			keepInternalFields: true,
		})) as { list: ApiCustomerV3[] };

		const v12Customer = v12.list.find((c) => c.id === customerId);
		expect(v12Customer).toBeDefined();
		expect(v12Customer!.features[TestFeature.Messages]).toBeDefined();
		expect(v12Customer!.features[TestFeature.Words]).toBeUndefined();
	},
);
