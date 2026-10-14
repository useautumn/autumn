import { test } from "bun:test";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

const ID_PREFIX = "lic-prop";
const PRO_CUSTOMER_ID = `${ID_PREFIX}-pro-customer`;
const SCALE_CUSTOMER_ID = `${ID_PREFIX}-scale-customer`;
const ENT_CUSTOMER_ID = `${ID_PREFIX}-ent-customer`;
const DIRECT_CUSTOMER_ID = `${ID_PREFIX}-direct-customer`;
const SEAT_PRICE = 20;
const SEAT_MESSAGES = 500;
const ENT_SEAT_MESSAGES = 900;

const heading = (label: string) =>
	console.log(
		`\n${chalk.cyanBright(`── ${label} ${"─".repeat(Math.max(0, 58 - label.length))}`)}`,
	);

test(`${chalk.yellowBright("SEED: license parent propagation playground (3 parents)")}`, async () => {
	const devSeat = products.base({
		id: "dev-seat",
		items: [
			items.monthlyPrice({ price: SEAT_PRICE }),
			items.monthlyMessages({ includedUsage: SEAT_MESSAGES }),
		],
		group: `${ID_PREFIX}-dev-seat-licenses`,
	});
	const pro = products.base({ id: "pro", items: [items.dashboard()] });
	const scale = products.base({
		id: "scale",
		items: [items.monthlyWords({ includedUsage: 100 })],
	});
	const ent = products.base({
		id: "ent",
		items: [items.dashboard(), items.monthlyWords({ includedUsage: 500 })],
	});

	const { ctx } = await initScenario({
		customerId: PRO_CUSTOMER_ID,
		setup: [
			s.customer({ paymentMethod: "success", testClock: false }),
			s.otherCustomers([
				{ id: SCALE_CUSTOMER_ID, paymentMethod: "success" },
				{ id: ENT_CUSTOMER_ID, paymentMethod: "success" },
				{ id: DIRECT_CUSTOMER_ID, paymentMethod: "success" },
			]),
			s.products({ list: [pro, scale, ent, devSeat], prefix: ID_PREFIX }),
		],
		actions: [
			s.licenses.link({
				parentProductId: pro.id,
				licenseProductId: devSeat.id,
				included: 1,
			}),
			s.licenses.link({
				parentProductId: scale.id,
				licenseProductId: devSeat.id,
				included: 2,
			}),
			s.licenses.link({
				parentProductId: ent.id,
				licenseProductId: devSeat.id,
				included: 3,
				customize: {
					remove_items: [{ feature_id: TestFeature.Messages }],
					add_items: [itemsV2.monthlyMessages({ included: ENT_SEAT_MESSAGES })],
				},
			}),
			s.billing.attach({
				productId: pro.id,
				licenseQuantities: [{ licenseProductId: devSeat.id, quantity: 2 }],
			}),
			s.billing.attach({
				customerId: SCALE_CUSTOMER_ID,
				productId: scale.id,
				licenseQuantities: [{ licenseProductId: devSeat.id, quantity: 3 }],
			}),
			s.billing.attach({
				customerId: DIRECT_CUSTOMER_ID,
				productId: devSeat.id,
			}),
			s.billing.attach({
				customerId: ENT_CUSTOMER_ID,
				productId: ent.id,
				licenseQuantities: [{ licenseProductId: devSeat.id, quantity: 4 }],
			}),
		],
	});

	heading("SEEDED");
	console.log(`license plan   ${devSeat.id}   (edit THIS one)`);
	console.log(`parent A       ${pro.id}   customer ${PRO_CUSTOMER_ID}`);
	console.log(`parent B       ${scale.id}   customer ${SCALE_CUSTOMER_ID}`);
	console.log(
		`parent C       ${ent.id}   customer ${ENT_CUSTOMER_ID}   (CUSTOMIZED: ${ENT_SEAT_MESSAGES} messages)`,
	);
	console.log(
		`direct cus     ${DIRECT_CUSTOMER_ID}   (on the license plan itself)`,
	);
	console.log(`org            ${ctx.org.id}`);

	heading("WHAT TO DO");
	console.log(`1. Open plan '${devSeat.id}' in the dashboard`);
	console.log(
		`2. Change included ${TestFeature.Messages} from ${SEAT_MESSAGES} to 1000`,
	);
	console.log("3. Save — the change dialog should open");

	heading("EXPECTED IN THE DIALOG");
	console.log("Parents step        lists all THREE parents, 1 customer each");
	console.log(
		`                    '${ent.id}' may flag a conflict (its link overrides messages)`,
	);
	console.log("Review step         parent cards badged 'Parent plan'");
	console.log(
		"Confirm button      reads 'Apply & migrate' (NOT 'Update version')",
	);

	heading("EXPECTED: TWO SEPARATE MIGRATIONS");
	console.log("You should land on /migrations with TWO new rows:");
	console.log("");
	console.log(`  1. child   plan_id ${devSeat.id}`);
	console.log(
		`             moves ${DIRECT_CUSTOMER_ID} (add_items/remove_items)`,
	);
	console.log(`  2. parents plan_id $in [${pro.id}, ${scale.id}]`);
	console.log("             moves their customers (upsert_licenses)");
	console.log("");
	console.log("Each runs and cancels on its own.");
	console.log(
		`'${ent.id}' is in NEITHER: its link overrides messages to ${ENT_SEAT_MESSAGES},`,
	);
	console.log(
		"so the child's edit never reaches it and there is nothing to migrate.",
	);

	heading("MORE SCENARIOS TO TRY");
	console.log(
		"- Deselect a parent in the Parents step: it keeps the old terms",
	);
	console.log("- Select ONLY the customized parent: expect a single op");
	console.log("- Add a free boolean item instead: expect no_billing_changes");
	console.log("- Change the seat PRICE: expect billing changes on all parents");

	heading("RE-READ STATE LATER");
	console.log(
		`./run.sh $(pwd)/tests/integration/licenses/catalog-update/child-plan/propagate/seeds/seed-license-parent-propagation-playground.test.ts`,
	);
	console.log("(re-running resets the playground to this clean state)");
});
