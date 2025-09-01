import {
	AllowanceType,
	type Entitlement,
	type Feature,
	FeatureType,
} from "@autumn/shared";
import { expect } from "chai";
import { AutumnCli } from "tests/cli/AutumnCli.js";
import { timeout } from "tests/utils/genUtils.js";
import { alexFeatures } from "./init.js";

const _checkEntitledOnFeatures = async (customerId: string, product: any) => {
	const entitlements: Entitlement[] = Object.values(product.entitlements);

	for (const entitlement of entitlements) {
		const { allowed, balanceObj }: any = await AutumnCli.entitled(
			customerId,
			entitlement.feature_id!,
			true,
		);

		// Type assertion to tell TypeScript that feature_id is a key of alexFeatures
		const feature =
			alexFeatures[entitlement.feature_id! as keyof typeof alexFeatures];

		try {
			if (feature.type === FeatureType.Boolean) {
				expect(allowed).to.equal(true);
				return;
			}

			if (entitlement.allowance === 0) {
				expect(allowed).to.equal(false);
				expect(balanceObj?.balance).to.equal(0);
				return;
			} else if (entitlement.allowance_type === AllowanceType.Unlimited) {
				expect(allowed).to.equal(true);
				expect(balanceObj?.balance).to.equal(null);
				expect(balanceObj?.unlimited).to.equal(true);
				return;
			}

			expect(allowed).to.equal(true);
			expect(balanceObj?.balance).to.equal(entitlement.allowance);
		} catch (error) {
			console.log("Checking entitlement: ", entitlement);
			console.log("Expected balance: ", entitlement.allowance);
			console.log("Entitled response: ", { allowed, balanceObj });
			throw error;
		}
	}
};

const getFeatureFromEntitlement = (entitlement: Entitlement) => {
	return alexFeatures[
		entitlement.feature_id! as keyof typeof alexFeatures
	] as Feature & { eventName: string };
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
		expect(allowed).to.equal(true);
		return;
	}

	console.log(
		`     - Checking entitlement ${feature.id} has ${
			entitlement.allowance_type === AllowanceType.Unlimited
				? "unlimited balance"
				: `balance of ${expectedBalance}`
		}`,
	);

	// Get ent from cusRes
	const { entitlements: cusEnts }: any = cusRes;
	const { allowed, balanceObj }: any = entitledRes;

	const cusEnt = cusEnts.find(
		(e: any) =>
			e.feature_id === feature.id && e.interval === entitlement.interval,
	);

	try {
		expect(cusEnt).to.exist;
	} catch (error) {
		console.log(
			`Expected cus ent ${feature.id}, interval ${entitlement.interval} to exist`,
		);
		throw error;
	}

	if (entitlement.allowance_type === AllowanceType.Unlimited) {
		// Cus ent
		expect(cusEnt.balance).to.equal(null);
		expect(cusEnt.used).to.equal(null);
		expect(cusEnt.unlimited).to.equal(true);

		// Entitled res
		expect(allowed).to.equal(true);
		expect(balanceObj?.balance).to.equal(null);
		expect(balanceObj?.unlimited).to.equal(true);
		return;
	}

	if (expectedBalance === 0) {
		expect(allowed).to.equal(false);
		expect(balanceObj?.balance).to.equal(0);
		expect(cusEnt.balance).to.equal(0);
		return;
	}

	expect(balanceObj?.balance).to.equal(expectedBalance);
	expect(cusEnt.balance).to.equal(expectedBalance);
};

export const runEventsAndCheckBalances = async ({
	customerId,
	entitlements,
}: {
	customerId: string;
	entitlements: Entitlement[];
}) => {
	for (const entitlement of entitlements) {
		if (
			entitlement.allowance === 0 &&
			entitlement.allowance_type !== AllowanceType.Unlimited
		) {
			continue;
		}

		const feature = getFeatureFromEntitlement(entitlement);

		if (
			entitlement.allowance_type === AllowanceType.Unlimited ||
			feature.type === FeatureType.Boolean
		) {
			await checkFeatureHasCorrectBalance({
				customerId,
				feature,
				entitlement,
				expectedBalance: entitlement.allowance!,
			});
			continue;
		}

		// 1. Check that feature has full balance
		await checkFeatureHasCorrectBalance({
			customerId,
			feature,
			entitlement,
			expectedBalance: entitlement.allowance!,
		});

		// console.log("     - Running events & entitled check for:", feature.id);

		const firstHalf = Math.min(Math.floor(entitlement.allowance! / 2), 50);
		const secondHalf = entitlement.allowance! - firstHalf;

		// 1. Send first half
		const batchUpdate = [];
		for (let i = 0; i < firstHalf; i++) {
			batchUpdate.push(
				AutumnCli.sendEvent({
					customerId,
					eventName: feature.eventName!,
				}),
			);
		}

		const timeoutMilli = Math.max(Math.floor(firstHalf / 2.5), 2) * 2500;
		await timeout(timeoutMilli);

		await Promise.all(batchUpdate);

		await checkFeatureHasCorrectBalance({
			customerId,
			feature,
			entitlement,
			expectedBalance: entitlement.allowance! - firstHalf,
		});

		if (secondHalf > 50) {
			continue;
			// TODO: Make balance 0 and check that it's blocked...
			// await AutumnCli.sendEvent({
			// 	customerId,
			// 	eventName: feature.eventName!,
			// 	properties: {
			// 		value: secondHalf,
			// 	},
			// });

			// await timeout(1000);

			// await checkFeatureHasCorrectBalance({
			// 	customerId,
			// 	feature,
			// 	entitlement,
			// 	expectedBalance: 0,
			// });
			// return;
		}

		for (let i = 0; i < secondHalf; i++) {
			batchUpdate.push(
				AutumnCli.sendEvent({
					customerId,
					eventName: feature.eventName!,
				}),
			);
		}

		await timeout(timeoutMilli);

		await Promise.all(batchUpdate);

		await checkFeatureHasCorrectBalance({
			customerId,
			feature,
			entitlement,
			expectedBalance: 0,
		});
	}
};
