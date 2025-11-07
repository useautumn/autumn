import { expect } from "bun:test";
import type { ProductV2 } from "@autumn/shared";
import { AutumnCli } from "../../../cli/AutumnCli.js";
import { TestFeature } from "../../../setup/v2Features.js";
import { timeout } from "../../../utils/genUtils.js";

export const checkEntitledOnProduct = async ({
	customerId,
	product,
	totalAllowance,
	finish = false,
	usageBased = false,
	timeoutMs = 8000,
}: {
	customerId: string;
	product: ProductV2;
	totalAllowance?: number;
	finish?: boolean;
	usageBased?: boolean;
	timeoutMs?: number;
}) => {
	// Get allowance from ProductV2 - find the feature item for Messages
	const messagesItem = product.items.find(
		(item) => item.feature_id === TestFeature.Messages,
	);
	const allowance =
		totalAllowance ||
		(messagesItem?.included_usage &&
		typeof messagesItem.included_usage === "number"
			? messagesItem.included_usage
			: 0);

	// const randomNum = Math.floor(Math.random() * (allowance - 1));
	const randomNum = 3;

	const batchUpdates = [];
	for (let i = 0; i < randomNum; i++) {
		batchUpdates.push(
			AutumnCli.sendEvent({
				customerId: customerId,
				featureId: TestFeature.Messages,
			}),
		);
	}

	await Promise.all(batchUpdates);
	await timeout(timeoutMs);
	let used = randomNum;

	// 2. Check entitled
	const { allowed, balanceObj }: any = await AutumnCli.entitled(
		customerId,
		TestFeature.Messages,
		true,
	);

	expect(allowed).toBe(true);
	expect(
		balanceObj!.balance,
		`balance for messages should be ${allowance - randomNum}, but got ${balanceObj!.balance}`,
	).toBe(allowance - randomNum);

	if (!finish) return used;

	// Finish up
	const batchUpdates2 = [];
	for (let i = 0; i < allowance - randomNum; i++) {
		batchUpdates2.push(
			AutumnCli.sendEvent({
				customerId: customerId,
				featureId: TestFeature.Messages,
			}),
		);
	}
	await Promise.all(batchUpdates2);
	await timeout(timeoutMs);
	used += allowance - randomNum;

	// 3. Check entitled again
	const { allowed: allowed2, balanceObj: balanceObj2 }: any =
		await AutumnCli.entitled(customerId, TestFeature.Messages, true);
	try {
		if (usageBased) {
			expect(allowed2).toBe(true);
		} else {
			expect(allowed2).toBe(false);
		}
		expect(balanceObj2!.balance).toBe(0);
		return used;
	} catch (error) {
		console.group();
		console.group();
		console.log("Expected balance to be: ", 0);
		console.log("Entitled res: ", { allowed2, balanceObj2 });
		console.groupEnd();
		console.groupEnd();
		throw error;
	}
};
