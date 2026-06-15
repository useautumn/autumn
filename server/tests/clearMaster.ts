import { clearMasterOrg } from "./clearMasterOrg.js";

const seedFeatures = !process.argv.includes("--no-seed");

await clearMasterOrg({ seedFeatures });
process.exit(0);
