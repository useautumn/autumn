import { organizations } from "@autumn/shared";
import type { DrizzleCli } from "@/db/initDrizzle.js";

export const getAllOrgs = async (db: DrizzleCli) => {
	const orgs = [];
	let offset = 0;
	const limit = 1000;

	while (true) {
		const batch = await db
			.select()
			.from(organizations)
			.limit(limit)
			.offset(offset);
		orgs.push(...batch);

		if (batch.length < limit) {
			break;
		}

		offset += limit;
		console.log(`Fetched ${orgs.length} orgs`);
	}
	return orgs;
};
