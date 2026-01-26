import { MigrationJobStep, type Organization } from "@autumn/shared";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { sendTextEmail } from "@/external/resend/resendUtils.js";
import { safeResend } from "@/external/resend/safeResend.js";
import { MigrationService } from "../migrations/MigrationService.js";
import { FROM_AUTUMN } from "./constants.js";

export const sendMigrationEmail = safeResend({
	fn: async ({
		db,
		migrationJobId,
		org,
	}: {
		db: DrizzleCli;
		migrationJobId: string;
		org: Organization;
	}) => {
		const migrationJob = await MigrationService.getJob({
			db,
			id: migrationJobId,
		});

		// Send email
		const getCustomersStep =
			migrationJob.step_details[MigrationJobStep.GetCustomers];
		const migrateStep =
			migrationJob.step_details[MigrationJobStep.MigrateCustomers];

		console.log("Sending migration email");
		await sendTextEmail({
			from: FROM_AUTUMN,
			to: "johnyeocx@gmail.com",
			subject: `Migration Job Finished -- ${migrationJob.id}`,
			body: `
  
  ORG: ${org.id}, ${org.slug}
  Step: Get migration customers
  
  1. Total customers: ${getCustomersStep?.total_customers}
  2. Canceled customers: ${getCustomersStep?.canceled_customers}
  
  Step: Migrate customers
  
  1. Number of errors: ${migrateStep?.num_errors}
  2. Failed customers: 
  ${migrateStep?.failed_customers}
  `,
		});
	},
	action: "send migration email",
});
