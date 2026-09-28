import { randomUUID } from "node:crypto";
import { and, count, desc, eq, inArray, isNull, lt, ne } from "drizzle-orm";
import type { Reservation } from "../../../api/contract.ts";
import { reservations, stripeAccounts } from "../../../db/schema/accounts.ts";
import { users } from "../../../db/schema/auth.ts";
import { stripeKeys } from "../../../db/schema/keys.ts";
import { TwdError } from "../../../http/apiError.ts";
import type { TwdContext } from "../../../lib/types/twdContext.ts";
import { lockCleanAccounts, usableKey } from "../repos/cleanAccountsRepo.ts";

const MAX_TTL_MS = 24 * 60 * 60 * 1000;
const TTL_UNIT_MS = { m: 60_000, h: 3_600_000 } as const;

const parseTtl = ({ ttl }: { ttl: string }): number => {
	const match = /^(\d+)\s*([mh])$/.exec(ttl.trim());
	const ms = match
		? Number(match[1]) * TTL_UNIT_MS[match[2] as keyof typeof TTL_UNIT_MS]
		: Number.NaN;
	if (!(ms > 0) || ms > MAX_TTL_MS) {
		throw new TwdError({
			status: 400,
			code: "invalid_ttl",
			message: `ttl "${ttl}" must look like "30m" or "2h" and be at most 24h.`,
			next: 'Retry with a ttl such as "2h".',
		});
	}
	return ms;
};

const requireActor = ({ ctx }: { ctx: TwdContext }) => {
	if (ctx.actor) return ctx.actor;
	throw new TwdError({
		status: 401,
		code: "unauthenticated",
		message: "Reservations need a signed-in user or API key.",
		next: "Sign in or send Authorization: Bearer twd_…",
	});
};

const toReservations = async ({
	ctx,
	rows,
}: {
	ctx: TwdContext;
	rows: (typeof reservations.$inferSelect)[];
}): Promise<Reservation[]> => {
	if (rows.length === 0) return [];
	const ids = rows.map((row) => row.id);
	const userIds = [...new Set(rows.map((row) => row.userId))];
	const [accounts, owners] = await Promise.all([
		ctx.db
			.select({
				id: stripeAccounts.id,
				reservationId: stripeAccounts.reservationId,
			})
			.from(stripeAccounts)
			.where(inArray(stripeAccounts.reservationId, ids)),
		ctx.db
			.select({ id: users.id, email: users.email })
			.from(users)
			.where(inArray(users.id, userIds)),
	]);
	const emails = new Map(owners.map((owner) => [owner.id, owner.email]));
	return rows.map((row) => ({
		id: row.id,
		owner: {
			userId: row.userId,
			email: emails.get(row.userId) ?? row.userId,
			via: row.via,
		},
		note: row.note,
		accountIds: accounts
			.filter((account) => account.reservationId === row.id)
			.map((account) => account.id),
		expiresAt: row.expiresAt.toISOString(),
		releasedAt: row.releasedAt?.toISOString() ?? null,
		createdAt: row.createdAt.toISOString(),
	}));
};

/** clean → reserved (held by the actor) for `ttl`; spread across usable keys. */
export const createReservation = async ({
	ctx,
	count: need,
	ttl,
	note,
}: {
	ctx: TwdContext;
	count: number;
	ttl: string;
	note?: string;
}): Promise<Reservation> => {
	const actor = requireActor({ ctx });
	const expiresAt = new Date(Date.now() + parseTtl({ ttl }));
	const id = `res_${randomUUID()}`;
	const row = await ctx.db.transaction(async (tx) => {
		const ids = await lockCleanAccounts({ tx, need });
		if (ids.length < need) {
			const [pool] = await tx
				.select({ n: count() })
				.from(stripeAccounts)
				.innerJoin(
					stripeKeys,
					eq(stripeKeys.platformAccountId, stripeAccounts.platformAccountId),
				)
				.where(and(ne(stripeAccounts.state, "broken"), usableKey));
			throw new TwdError({
				status: 409,
				code: "insufficient_accounts",
				message: `Asked to reserve ${need} accounts, only ${ids.length} clean on usable keys.`,
				next: "Reserve fewer or wait for nukes to finish; GET /capacity.",
				escalate:
					pool.n < need
						? `The whole pool is ${pool.n} accounts — ask a twd admin to add Stripe accounts/keys.`
						: undefined,
				details: { need, have: ids.length, pool: pool.n },
			});
		}
		const [inserted] = await tx
			.insert(reservations)
			.values({ id, userId: actor.userId, via: actor.via, note, expiresAt })
			.returning();
		await tx
			.update(stripeAccounts)
			.set({
				state: "reserved",
				heldBy: actor.userId,
				reservationId: id,
				reservedUntil: expiresAt,
				stateChangedAt: new Date(),
			})
			.where(inArray(stripeAccounts.id, ids));
		return inserted;
	});
	const [reservation] = await toReservations({ ctx, rows: [row] });
	return reservation;
};

export const listReservations = async ({
	ctx,
}: {
	ctx: TwdContext;
}): Promise<Reservation[]> => {
	const rows = await ctx.db
		.select()
		.from(reservations)
		.where(isNull(reservations.releasedAt))
		.orderBy(desc(reservations.createdAt));
	return toReservations({ ctx, rows });
};

/** Reserved accounts go back to clean; ones a run already took stay with that run. */
const releaseRows = async ({
	ctx,
	ids,
}: {
	ctx: TwdContext;
	ids: string[];
}) => {
	if (ids.length === 0) return;
	const now = new Date();
	await ctx.db.transaction(async (tx) => {
		await tx
			.update(reservations)
			.set({ releasedAt: now })
			.where(
				and(inArray(reservations.id, ids), isNull(reservations.releasedAt)),
			);
		await tx
			.update(stripeAccounts)
			.set({
				state: "clean",
				heldBy: null,
				reservationId: null,
				reservedUntil: null,
				stateChangedAt: now,
			})
			.where(
				and(
					inArray(stripeAccounts.reservationId, ids),
					eq(stripeAccounts.state, "reserved"),
				),
			);
	});
};

/** Owner only; everyone else gets `forbidden` naming the owner. */
export const releaseReservation = async ({
	ctx,
	reservationId,
}: {
	ctx: TwdContext;
	reservationId: string;
}): Promise<Reservation> => {
	const actor = requireActor({ ctx });
	const [row] = await ctx.db
		.select()
		.from(reservations)
		.where(eq(reservations.id, reservationId));
	if (!row) {
		throw new TwdError({
			status: 404,
			code: "reservation_not_found",
			message: `Reservation ${reservationId} does not exist.`,
			next: "GET /reservations to list live reservations.",
		});
	}
	if (row.userId !== actor.userId) {
		const [owner] = await toReservations({ ctx, rows: [row] });
		throw new TwdError({
			status: 403,
			code: "forbidden",
			message: `Reservation ${reservationId} belongs to ${owner.owner.email}.`,
			next: "Leave it; it expires on its own at expiresAt.",
			escalate: `Ask ${owner.owner.email} to release reservation ${reservationId}.`,
			details: { owner: owner.owner.email, expiresAt: owner.expiresAt },
		});
	}
	await releaseRows({ ctx, ids: [reservationId] });
	const [released] = await ctx.db
		.select()
		.from(reservations)
		.where(eq(reservations.id, reservationId));
	const [reservation] = await toReservations({ ctx, rows: [released] });
	return reservation;
};

/** Release every expired reservation. The integrator schedules this. */
export const sweepExpiredReservations = async ({
	ctx,
}: {
	ctx: TwdContext;
}): Promise<{ released: number }> => {
	const expired = await ctx.db
		.select({ id: reservations.id })
		.from(reservations)
		.where(
			and(
				isNull(reservations.releasedAt),
				lt(reservations.expiresAt, new Date()),
			),
		);
	await releaseRows({ ctx, ids: expired.map((row) => row.id) });
	if (expired.length) {
		ctx.logger.info("twd reservations expired", { released: expired.length });
	}
	return { released: expired.length };
};
