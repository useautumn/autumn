import { expect } from "bun:test";
import {
	AllowanceType,
	CusProductStatus,
	type Entitlement,
	type Feature,
	type FeatureOptions,
	FeatureType,
	type UsagePriceConfig,
} from "@autumn/shared";
import type { ApiCustomerV1 } from "@shared/api/customers/previousVersions/apiCustomerV1.js";
import { AutumnCli } from "@tests/cli/AutumnCli.js";
// import { expect } from "chai";
import { Decimal } from "decimal.js";

export const checkProductIsScheduled = ({
	cusRes,
	product,
}: {
	cusRes: any;
	product: any;
}) => {
	const { products, add_ons, entitlements } = cusRes;
	const prod = products.find((p: any) => p.id === product.id);
	try {
		expect(prod).toBeDefined();
		expect(prod.status).toEqual(CusProductStatus.Scheduled);
	} catch (error) {
		console.group();
		console.log(`Expected product ${product.id} to be scheduled`);
		console.log("Received: ", cusRes.products);
		console.groupEnd();
		throw error;
	}
};

export const compareMainProduct = ({
	sent,
	cusRes,
	status = CusProductStatus.Active,
	optionsList = [],
}: {
	sent: any;
	cusRes: any;
	status?: CusProductStatus;
	optionsList?: FeatureOptions[];
}) => {
	const { products, add_ons, entitlements } = cusRes;
	const prod = products.find(
		(p: any) => p.id === sent.id && p.status === status && !sent.is_add_on,
	);

	expect(
		prod,
		`Product ${sent.id} not found (status: ${status}), (${sent.is_add_on ? "add-on" : "main"})`,
	).toBeDefined();

	// Check entitlements
	const sentEntitlements = Object.values(sent.entitlements) as Entitlement[];
	const recEntitlements = entitlements;

	for (const entitlement of sentEntitlements) {
		// Corresponding entitlement in received
		const recEntitlement = recEntitlements.find(
			(e: ApiCustomerV1["entitlements"][number]) => {
				if (e.feature_id !== entitlement.feature_id) return false;

				if (entitlement.allowance_type === AllowanceType.Unlimited) {
					return true;
				}

				if (entitlement.interval && e.interval !== entitlement.interval) {
					return false;
				}
				return true;
			},
		);

		// If options list provideed, and feature
		const options = optionsList.find(
			(o: any) => o.feature_id === entitlement.feature_id,
		);

		let expectedBalance = entitlement.allowance;
		if (options?.quantity) {
			// Get price from sent
			const price = sent.prices.find(
				(p: any) => p.config.feature_id === entitlement.feature_id,
			);
			const config = price.config as UsagePriceConfig;
			expectedBalance = new Decimal(expectedBalance || 0)
				.add(options.quantity * (config.billing_units || 1))
				.toNumber();
		}

		expect(
			recEntitlement,
			`Entitlement ${entitlement.feature_id} not found`,
		).toBeDefined();

		if (entitlement.allowance_type === AllowanceType.Unlimited) {
			// expect(recEntitlement.unlimited).toStrictEqual(true);
			// expect(recEntitlement.balance).toStrictEqual(null);
			// expect(recEntitlement.used).toStrictEqual(null);
			expect(recEntitlement).toMatchObject({
				unlimited: true,
				balance: null,
				used: null,
			});
		} else if ("balance" in entitlement) {
			expect(
				recEntitlement.balance,
				`Balance for ${entitlement.feature_id} does not match expected balance`,
			).toStrictEqual(expectedBalance);
		}
	}
};

export const checkFeatureHasCorrectBalance = async ({
	customerId,
	feature,
	entitlement,
	expectedBalance,
}: {
	customerId: string;
	feature: Feature;
	entitlement: Entitlement;
	expectedBalance: number;
}) => {
	const [entitledRes, cusRes] = await Promise.all([
		AutumnCli.entitled(customerId, feature.id, true),
		AutumnCli.getCustomer(customerId),
	]);

	if (feature.type === FeatureType.Boolean) {
		console.log("     - Checking boolean feature: ", feature.id);
		const { allowed, balanceObj }: any = entitledRes;
		expect(allowed, `Allowed for ${feature.id} is not true`).toStrictEqual(
			true,
		);
		return;
	}

	// console.log(
	//   `     - Checking entitlement ${feature.id} has ${
	//     entitlement.allowance_type == AllowanceType.Unlimited
	//       ? "unlimited balance"
	//       : `balance of ${expectedBalance}`
	//   }`
	// );

	// Get ent from cusRes
	const { entitlements: cusEnts }: any = cusRes;
	const { allowed, balanceObj }: any = entitledRes;
	const cusEnt = cusEnts.find(
		(e: any) =>
			e.feature_id === feature.id && e.interval === entitlement.interval,
	);

	expect(cusEnt, `Cus ent for ${feature.id} not found`).toBeDefined();

	if (entitlement.allowance_type === AllowanceType.Unlimited) {
		// Cus ent
		expect(
			cusEnt.balance,
			`Balance for ${feature.id} is not null`,
		).toStrictEqual(null);
		expect(cusEnt.used, `Used for ${feature.id} is not null`).toStrictEqual(
			null,
		);
		expect(
			cusEnt.unlimited,
			`Unlimited for ${feature.id} is not true`,
		).toStrictEqual(true);

		// Entitled res
		expect(allowed, `Allowed for ${feature.id} is not true`).toStrictEqual(
			true,
		);
		expect(
			balanceObj?.balance,
			`Balance for ${feature.id} is not null`,
		).toStrictEqual(null);
		expect(
			balanceObj?.unlimited,
			`Unlimited for ${feature.id} is not true`,
		).toStrictEqual(true);
		return;
	}

	if (expectedBalance === 0) {
		expect(allowed, `Allowed for ${feature.id} is not false`).toStrictEqual(
			false,
		);
		expect(
			balanceObj?.balance,
			`Balance for ${feature.id} is not 0`,
		).toStrictEqual(0);
		expect(cusEnt.balance, `Balance for ${feature.id} is not 0`).toStrictEqual(
			0,
		);
		return;
	}

	expect(
		balanceObj?.balance,
		`Balance for ${feature.id} does not match expected balance`,
	).toStrictEqual(expectedBalance);
	expect(
		cusEnt.balance,
		`Balance for ${feature.id} does not match expected balance`,
	).toStrictEqual(expectedBalance);
};
