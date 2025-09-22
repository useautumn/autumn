import { DrizzleCli } from "@/db/initDrizzle.js";
import { user } from "@autumn/shared";

import { desc } from "drizzle-orm";

export const getAllUsers = async (db: DrizzleCli) => {
	const users = [];
	let offset = 0;
	const limit = 200;

	while (true) {
		const batch = await db
			.select()
			.from(user)
			.limit(limit)
			.offset(offset)
			.orderBy(desc(user.createdAt));
		users.push(...batch);

		if (batch.length < limit) {
			break;
		}

		offset += limit;
		console.log(`Fetched ${users.length} users`);
	}
	return users;
};
