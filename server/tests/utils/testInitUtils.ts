import { createStripeCli } from "@/external/stripe/utils.js";
import { AppEnv, Organization } from "@autumn/shared";
import { SupabaseClient } from "@supabase/supabase-js";
import { initCustomer } from "./init.js";
import { DrizzleCli } from "@/db/initDrizzle.js";

export const initCustomerWithTestClock = async ({
	customerId,
	org,
	env,
	db,
	fingerprint,
}: {
	customerId: string;
	org: Organization;
	env: AppEnv;
	db: DrizzleCli;
	fingerprint?: string;
}) => {
	const stripeCli = createStripeCli({ org: org, env: env });
	const testClock = await stripeCli.testHelpers.testClocks.create({
		frozen_time: Math.floor(Date.now() / 1000),
	});

	let customer = await initCustomer({
		customer_data: {
			id: customerId,
			name: customerId,
			email: "test@test.com",
			fingerprint,
		},
		db: db,
		org: org,
		env: env,
		testClockId: testClock.id,
		attachPm: true,
	});

	return { testClockId: testClock.id, customer };
};
