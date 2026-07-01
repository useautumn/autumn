import { ErrCode, member, organizations, RecaseError } from "@autumn/shared";
import { asc, eq } from "drizzle-orm";
import type { Context } from "hono";
import { db } from "@/db/initDrizzle.js";
import { auth } from "@/utils/auth.js";

const AUTH_ORGANIZATION_LIST_LIMIT = 1000;

export const handleListAuthOrganizations = async (c: Context) => {
	const session = await auth.api.getSession({
		headers: c.req.raw.headers,
	});

	if (!session?.user?.id) {
		throw new RecaseError({
			message: "Unauthorized - no session found",
			code: ErrCode.NoAuthHeader,
			statusCode: 401,
		});
	}

	const orgs = await db
		.select({
			id: organizations.id,
			name: organizations.name,
			slug: organizations.slug,
			logo: organizations.logo,
			createdAt: organizations.createdAt,
			metadata: organizations.metadata,
			// Surfaced so the client can disable selection of passkey-gated
			// orgs in the org switcher (see useOrgAccess). Not part of the
			// upstream better-auth Organization type — we hand-roll this
			// route to override its default 100-member join cap anyway.
			config: organizations.config,
		})
		.from(member)
		.innerJoin(organizations, eq(member.organizationId, organizations.id))
		.where(eq(member.userId, session.user.id))
		.orderBy(
			asc(organizations.name),
			asc(organizations.slug),
			asc(organizations.id),
		)
		.limit(AUTH_ORGANIZATION_LIST_LIMIT);

	const sanitized = orgs.map((org) => ({
		id: org.id,
		name: org.name,
		slug: org.slug,
		logo: org.logo,
		createdAt: org.createdAt,
		metadata: org.metadata,
		// Promote the single client-relevant config flag into a flat field so
		// the rest of `config` (Stripe/feature-flag internals) stays inside
		// the server boundary.
		requirePasskey: org.config?.require_passkey === true,
	}));

	return c.json(sanitized);
};
