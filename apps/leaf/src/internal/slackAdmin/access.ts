import { organizations } from "@autumn/shared";
import { desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { db } from "../../lib/db.js";
import { env } from "../../lib/env.js";

export const validateSlackAdminAccessConfig = ({
	configuredWorkspaceId,
	workspaceId,
}: {
	configuredWorkspaceId?: string;
	workspaceId: string;
}): { allowed: true } | { allowed: false; reason: string } => {
	if (!configuredWorkspaceId) {
		return { allowed: false, reason: "admin_config_missing" };
	}
	if (configuredWorkspaceId && workspaceId !== configuredWorkspaceId) {
		return { allowed: false, reason: "wrong_workspace" };
	}

	return { allowed: true };
};

export const shouldUseSlackAdminInstallationForWorkspace = ({
	configuredWorkspaceId,
	isProduction,
	workspaceId,
}: {
	configuredWorkspaceId?: string;
	isProduction: boolean;
	workspaceId: string;
}) => {
	if (!configuredWorkspaceId) return false;
	return workspaceId === configuredWorkspaceId;
};

export const validateSlackAdminAccess = ({
	workspaceId,
}: {
	workspaceId: string;
}) =>
	validateSlackAdminAccessConfig({
		configuredWorkspaceId: env.SLACK_ADMIN_WORKSPACE_ID,
		workspaceId,
	});

const normalizeIdentifierText = ({ identifier }: { identifier: string }) =>
	identifier
		.trim()
		.replace(/[`"'“”‘’]/g, "")
		.replace(/\s+/g, " ");

export const orgIdentifierVariants = ({
	identifier,
}: {
	identifier: string;
}) => {
	const normalized = normalizeIdentifierText({ identifier });
	const lower = normalized.toLowerCase();
	const slug = lower
		.replace(/&/g, " and ")
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
	const compact = lower.replace(/[^a-z0-9]+/g, "");

	return [...new Set([normalized, lower, slug, compact].filter(Boolean))];
};

const escapeLikePattern = ({ value }: { value: string }) =>
	value.replace(/[\\%_]/g, (match) => `\\${match}`);

export const resolveSlackAdminOrg = async ({
	identifier,
}: {
	identifier: string;
}) => {
	const trimmed = normalizeIdentifierText({ identifier });
	if (!trimmed) return null;

	const variants = orgIdentifierVariants({ identifier: trimmed });
	const exactOrg = await db.query.organizations.findFirst({
		where: or(
			eq(organizations.id, trimmed),
			variants.length > 0 ? inArray(organizations.slug, variants) : undefined,
		),
		columns: { id: true, slug: true },
	});
	if (exactOrg) return exactOrg;

	const [slugQuery] = variants.filter((variant) => variant.includes("-"));
	const search = escapeLikePattern({ value: trimmed });
	const slugSearch = slugQuery ? escapeLikePattern({ value: slugQuery }) : null;
	const score = sql<number>`greatest(
		similarity(${organizations.slug}, ${trimmed}),
		similarity(${organizations.name}, ${trimmed}),
		${slugQuery ? sql`similarity(${organizations.slug}, ${slugQuery})` : sql`0`}
	)`;
	const candidates = await db
		.select({
			id: organizations.id,
			slug: organizations.slug,
			score,
		})
		.from(organizations)
		.where(
			or(
				ilike(organizations.name, `%${search}%`),
				ilike(organizations.slug, `%${search}%`),
				slugSearch ? ilike(organizations.slug, `%${slugSearch}%`) : undefined,
				sql`${organizations.name} % ${trimmed}`,
				sql`${organizations.slug} % ${trimmed}`,
				slugQuery ? sql`${organizations.slug} % ${slugQuery}` : undefined,
			),
		)
		.orderBy(desc(score), organizations.slug)
		.limit(3);

	const [first, second] = candidates;
	if (!first) return null;
	if (!second || first.score - second.score >= 0.12) {
		return { id: first.id, slug: first.slug };
	}

	return null;
};
