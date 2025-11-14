import dotenv from "dotenv";

dotenv.config();

import { AppEnv } from "@autumn/shared";
import { clearOrg, setupOrg } from "@tests/utils/setup.js";
import { initDrizzle } from "@/db/initDrizzle.js";
import {
	advanceProducts,
	attachProducts,
	creditSystems,
	entityProducts,
	features,
	oneTimeProducts,
	products,
	referralPrograms,
	rewards,
} from "./global.js";

const ORG_SLUG = process.env.TESTS_ORG!;
const DEFAULT_ENV = AppEnv.Sandbox;

describe("Initialize org for tests", () => {
	it("should initialize org", async function () {
		this.timeout(1000000000);
		this.org = await clearOrg({ orgSlug: ORG_SLUG, env: DEFAULT_ENV });
		this.env = DEFAULT_ENV;
		const { db, client } = initDrizzle();

		this.db = db;
		this.client = client;

		await setupOrg({
			orgId: this.org.id,
			env: DEFAULT_ENV,
		});

		console.log("--------------------------------");
	});
});
