import "dotenv/config";
import { loadLocalEnv } from "../src/utils/envUtils";

loadLocalEnv();

const requireEnv = ({ key }: { key: string }) => {
	const value = process.env[key];

	if (!value) {
		throw new Error(`${key} env var is required`);
	}

	return value;
};

export const prodTestOrgId = requireEnv({ key: "PROD_TEST_ORG_ID" });
export const prodTestCustomerId = requireEnv({
	key: "PROD_TEST_CUSTOMER_ID",
});
export const prodTestEntityId = process.env.PROD_TEST_ENTITY_ID || undefined;

export const { initDrizzle } = await import("../src/db/initDrizzle");
