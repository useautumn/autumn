import { AppEnv } from "@autumn/shared";
import {
	buildCachedApiCustomerKey,
	getCachedApiCustomer,
} from "../src/internal/customers/cusUtils/apiCusCacheUtils/getCachedApiCustomer.js";
import { initDrizzle } from "../src/db/initDrizzle.js";
import { initScript } from "../src/utils/scriptUtils/scriptUtils.js";
import { redis } from "../src/external/redis/initRedis.js";
import { AutumnInt } from "../src/external/autumn/autumnCli.js";

const DEDUCTION_COUNT = 15_000;
const DEDUCTION_AMOUNT = 1;

const logCredits = (label: string, customer: Awaited<ReturnType<typeof getCachedApiCustomer>>) => {
	const credits = customer?.features?.credits;
	console.log(`\n${label}`);
	console.log(`  Total Balance:    ${credits?.balance ?? "N/A"}`);
	console.log(`  Monthly Credits:  ${credits?.breakdown?.[0]?.balance ?? "N/A"}`);
	console.log(`  Lifetime Credits: ${credits?.breakdown?.[1]?.balance ?? "N/A"}`);
};

const main = async () => {
	const orgId = "org_2s4vfEyYVgFZDlOwcMHjsHR0eef";
	const env = AppEnv.Sandbox;
	const customerId = "john";


	const { db } = initDrizzle();
	const { req } = await initScript({ orgId, env });
	const autumn = new AutumnInt({
		secretKey: process.env.JDEV!,
	});

	await redis.del(buildCachedApiCustomerKey({ customerId, orgId, env }));

	const customerBefore = await getCachedApiCustomer({
		ctx: req as any,
		customerId,
	});
	logCredits("📊 Credits Before:", customerBefore);

	console.log(`\n⏳ Processing ${DEDUCTION_COUNT.toLocaleString()} deductions...`);
	const start = Date.now();
	

	const promises = Array.from({ length: DEDUCTION_COUNT }, () =>
		autumn.track({
			customer_id: customerId,
			feature_id: "credits",
			value: DEDUCTION_AMOUNT,
		}),
	);

	await Promise.all(promises);
	const elapsed = Date.now() - start;

	const customerAfter = await getCachedApiCustomer({
		ctx: req as any,
		customerId,
	});
	logCredits("📊 Credits After:", customerAfter);

	const deductionDiff = (customerBefore?.features?.credits?.balance ?? 0) - (customerAfter?.features?.credits?.balance ?? 0);

	console.log("\n✅ Test Complete!");
	console.log(`   Time Elapsed: ${elapsed.toLocaleString()}ms`);
	console.log(`   Total Deducted: ${deductionDiff}`);
	console.log(`   Avg per Deduction: ${(elapsed / DEDUCTION_COUNT).toFixed(3)}ms\n`);
};

await main();
process.exit(0);