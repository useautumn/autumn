import dotenv from "dotenv";

dotenv.config();

import { AppEnv } from "@autumn/shared";
import { Autumn as AutumnJS } from "autumn-js";
import { after } from "mocha";
import { initDrizzle } from "@/db/initDrizzle.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { createStripeCli } from "@/external/stripe/utils.js";
import { OrgService } from "@/internal/orgs/OrgService.js";

const ORG_SLUG = process.env.TESTS_ORG!;
const DEFAULT_ENV = AppEnv.Sandbox;

import { Hyperbrowser } from "@hyperbrowser/sdk";

const _hyperbrowser = new Hyperbrowser({
	apiKey: process.env.HYPERBROWSER_API_KEY,
});

export const setupBefore = async (instance: any) => {
	try {
		const { db, client } = initDrizzle();

		const org = await OrgService.getBySlug({ db, slug: ORG_SLUG });
		if (!org) {
			throw new Error("Org not found");
		}
		const env = DEFAULT_ENV;
		const autumnSecretKey = process.env.UNIT_TEST_AUTUMN_SECRET_KEY!;
		const autumn = new AutumnInt({ apiKey: autumnSecretKey });

		const autumnJs = new AutumnJS({
			secretKey: autumnSecretKey,
			url: "http://localhost:8080/v1",
		});

		const stripeCli = createStripeCli({ org, env });
		instance.org = org;
		instance.env = env;
		instance.autumn = autumn;
		instance.stripeCli = stripeCli;
		instance.autumnJs = autumnJs;
		instance.db = db;
		instance.client = client;
	} catch (error) {
		console.log("Error setting up before", error);
		throw error;
	}

	// Return a cleanup function
	after(async () => {
		await instance.client?.end();
	});
};
