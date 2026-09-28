import { Hono } from "hono";
import { z } from "zod";
import { CreateReservationBody } from "../../api/contract.ts";
import { forgetAccount } from "../../internal/accounts/actions/forgetAccount.ts";
import { listAccounts } from "../../internal/accounts/actions/listAccounts.ts";
import { nukeAccounts } from "../../internal/accounts/actions/nukeAccounts.ts";
import {
	createReservation,
	listReservations,
	releaseReservation,
} from "../../internal/accounts/actions/reservations.ts";
import { TwdError } from "../apiError.ts";
import type { TwdHono } from "../types/twdHono.ts";

const ListAccountsQuery = z.object({
	state: z.enum(["clean", "reserved", "in_use", "nuking", "broken"]).optional(),
	key: z.string().optional(),
});
const NukeAccountsBody = z.object({
	accountIds: z.array(z.string()).min(1).max(2000),
});

const parse = <T extends z.ZodTypeAny>({
	schema,
	value,
	next,
}: {
	schema: T;
	value: unknown;
	next: string;
}): z.infer<T> => {
	const parsed = schema.safeParse(value);
	if (parsed.success) return parsed.data;
	throw new TwdError({
		status: 400,
		code: "invalid_request",
		message: parsed.error.message,
		next,
	});
};

export const accountsRoutes = new Hono<TwdHono>()
	.get("/accounts", async (c) => {
		const query = parse({
			schema: ListAccountsQuery,
			value: c.req.query(),
			next: "Filter with ?state=clean|reserved|in_use|nuking|broken&key=<platform acct_…>.",
		});
		return c.json(
			await listAccounts({
				ctx: c.get("ctx"),
				state: query.state,
				platformAccountId: query.key,
			}),
		);
	})
	.get("/reservations", async (c) =>
		c.json(await listReservations({ ctx: c.get("ctx") })),
	)
	.post("/reservations", async (c) => {
		const body = parse({
			schema: CreateReservationBody,
			value: await c.req.json().catch(() => ({})),
			next: 'Send { count: 1-2000, ttl?: "2h", note?: string }.',
		});
		return c.json(await createReservation({ ctx: c.get("ctx"), ...body }), 201);
	})
	.delete("/reservations/:id", async (c) =>
		c.json(
			await releaseReservation({
				ctx: c.get("ctx"),
				reservationId: c.req.param("id"),
			}),
		),
	)
	.post("/accounts/nuke", async (c) => {
		const body = parse({
			schema: NukeAccountsBody,
			value: await c.req.json().catch(() => ({})),
			next: 'Send { accountIds: ["acct_…"] }.',
		});
		return c.json(
			await nukeAccounts({ ctx: c.get("ctx"), accountIds: body.accountIds }),
			202,
		);
	})
	.delete("/accounts/:id", async (c) =>
		c.json(
			await forgetAccount({ ctx: c.get("ctx"), accountId: c.req.param("id") }),
		),
	);
