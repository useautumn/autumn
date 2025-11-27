import { CusEntService } from "../src/internal/customers/cusProducts/cusEnts/CusEntitlementService";
import { initDrizzle } from "../src/db/initDrizzle";
import { clearCusEntsFromCache } from "../src/cron/cronUtils";

const main = async () => {
  const { db } = initDrizzle();
	const cusEnts = await CusEntService.getActiveResetPassed({
		db,
		batchSize: 500,
	});

  
  await clearCusEntsFromCache({ cusEnts });
};

await main();
process.exit(0);