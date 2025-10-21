import { user as userTable } from "@autumn/shared";
import { eq } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";

export class UserService {
	static async getByEmail({ db, email }: { db: DrizzleCli; email: string }) {
		return await db.query.user.findFirst({
			where: eq(userTable.email, email),
		});
	}
}
