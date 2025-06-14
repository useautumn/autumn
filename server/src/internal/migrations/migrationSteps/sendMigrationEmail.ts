import { MigrationService } from "../MigrationService.js";
import { sendTextEmail } from "@/external/resend/resendUtils.js";
import { MigrationJobStep, Organization } from "@autumn/shared";
import { DrizzleCli } from "@/db/initDrizzle.js";

export const sendMigrationEmail = async ({
  db,
  migrationJobId,
  org,
}: {
  db: DrizzleCli;
  migrationJobId: string;
  org: Organization;
}) => {
  let migrationJob = await MigrationService.getJob({
    db,
    id: migrationJobId,
  });

  // Send email
  let getCustomersStep =
    migrationJob.step_details[MigrationJobStep.GetCustomers];
  let migrateStep =
    migrationJob.step_details[MigrationJobStep.MigrateCustomers];

  console.log("Sending migration email");
  await sendTextEmail({
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
    from: "Ayush"
  });
};
