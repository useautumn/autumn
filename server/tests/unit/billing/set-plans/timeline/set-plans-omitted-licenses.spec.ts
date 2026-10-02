/** Omitted license_quantities keep the running seats in the opening phase and grant included seats only later. */

import { describe, expect, test } from "bun:test";
import type {
	CustomerLicenseQuantity,
	FullCusProduct,
	FullCustomerLicense,
	FullPlanLicense,
	FullProduct,
} from "@autumn/shared";
import { contexts } from "@tests/utils/fixtures/db/contexts";
import { products } from "@tests/utils/fixtures/db/products";
import chalk from "chalk";
import { setupSetPlansTimeline } from "@/internal/billing/v2/actions/setPlans/setup/setupSetPlansTimeline";
import { createConfigInterner } from "@/internal/billing/v2/actions/setPlans/timeline/instanceConfig/createConfigInterner";
import {
	buildContext,
	ctx,
	describeOperations,
	PHASE_B,
	paidProduct,
	running,
} from "./setPlansContextFixtures";

const SEAT_PLAN_ID = "seat";

const parentWithSeats = ({ included }: { included: number }): FullProduct => {
	const parent = paidProduct({ id: "parent" });
	return {
		...parent,
		licenses: [
			{
				id: "plan_lic_seat",
				included,
				product: products.createFull({ id: SEAT_PLAN_ID, prices: [] }),
			} as unknown as FullPlanLicense,
		],
	};
};

const runningWithSeats = ({
	parent,
	granted,
	paidQuantity,
}: {
	parent: FullProduct;
	granted: number;
	paidQuantity: number;
}): FullCusProduct => ({
	...running({ product: parent }),
	customer_licenses: [
		{
			id: "cus_lic_seat",
			granted,
			paid_quantity: paidQuantity,
			planLicense: parent.licenses?.[0] ?? null,
		} as unknown as FullCustomerLicense,
	],
});

const carriedSeats = (totalQuantity: number): CustomerLicenseQuantity[] => [
	{ licensePlanId: SEAT_PLAN_ID, totalQuantity },
];

const omittedLaterPhaseOperations = ({
	included,
	granted,
	paidQuantity,
}: {
	included: number;
	granted: number;
	paidQuantity: number;
}) => {
	const parent = parentWithSeats({ included });
	return describeOperations(
		setupSetPlansTimeline({
			ctx,
			billingContext: buildContext({
				existing: [runningWithSeats({ parent, granted, paidQuantity })],
				opening: [
					{
						fullProduct: parent,
						customerLicenseQuantities: carriedSeats(granted),
					},
				],
				later: [{ startsAt: PHASE_B, plans: [{ fullProduct: parent }] }],
			}),
			params: { undeclared_plans: "end" },
		}).diff,
	);
};

describe(chalk.yellowBright("set_plans omitted license quantities"), () => {
	test("a later phase that omits seats drops paid seats to the included ones", () => {
		expect(
			omittedLaterPhaseOperations({ included: 2, granted: 5, paidQuantity: 3 }),
		).toEqual(["insert:parent@B", "retime:cus_prod_parent:B"]);
	});

	test("a later phase that omits seats on a zero-seat plan still gets its own pool", () => {
		expect(
			omittedLaterPhaseOperations({ included: 0, granted: 3, paidQuantity: 3 }),
		).toEqual(["insert:parent@B", "retime:cus_prod_parent:B"]);
	});

	test("a later phase that omits seats keeps a plan holding only included seats", () => {
		expect(
			omittedLaterPhaseOperations({ included: 2, granted: 2, paidQuantity: 0 }),
		).toEqual([]);
	});

	test("included-only seats intern with a request for no more than the included seats", () => {
		const parent = parentWithSeats({ included: 2 });
		const { configHash } = createConfigInterner({
			features: contexts.create({}).features,
		});
		const config = {
			fullProduct: parent,
			featureQuantities: [],
			planQuantity: 1,
			resetsBillingCycle: false,
		};

		const requestedHash = configHash({
			...config,
			licenses: { type: "requested", quantities: carriedSeats(2) },
		});
		expect(configHash({ ...config, licenses: { type: "includedOnly" } })).toBe(
			requestedHash,
		);
		expect(
			configHash({
				...config,
				licenses: { type: "requested", quantities: carriedSeats(5) },
			}),
		).not.toBe(requestedHash);
	});
});
