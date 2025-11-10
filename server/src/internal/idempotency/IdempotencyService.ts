/** biome-ignore-all lint/complexity/noStaticOnlyClass: shush */

import {
	ErrCode,
	type IdempotentOperation,
	type InsertIdempotentOperation,
	idempotency,
	RecaseError,
} from "@autumn/shared";
import { sqlNow } from "@shared/db/utils.js";
import { StatusCodes } from "http-status-codes";
import type { DrizzleCli } from "@/db/initDrizzle.js";

export class IdempotencyService {
	static async create({
		db,
		data,
	}: {
		db: DrizzleCli;
		data: InsertIdempotentOperation;
	}) {
		return await db
			.insert(idempotency as any)
			.values(data)
			.returning();
	}

	static async get({
		db,
		id,
	}: {
		db: DrizzleCli;
		id: string;
	}): Promise<IdempotentOperation | null> {
		const result = await db.query.idempotency.findFirst({
			where: (idempotency, { eq, gt }) =>
				eq(idempotency.id, id) && gt(idempotency.expires_at, sqlNow),
		});
		return result ?? null;
	}

	static async validate({
		db,
		id,
	}: {
		db: DrizzleCli;
		id: string;
	}): Promise<void> {
		const idempotency = await IdempotencyService.get({ db, id });
		if (idempotency === null) return;
		else {
			throw new RecaseError({
				message: "Idempotency key already exists",
				code: ErrCode.IdempotencyKeyAlreadyExists,
				statusCode: StatusCodes.CONFLICT,
			});
		}
	}
}
