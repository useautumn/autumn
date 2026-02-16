import { getSessionFromCtx } from "better-auth/api";
import type { Organization } from "better-auth/plugins";
import type { AutumnOptions } from "./types";

export const scopeContainsOrg = ({ options }: { options?: AutumnOptions }) => {
	return (
		options?.customerScope === "organization" ||
		options?.customerScope === "user_and_organization"
	);
};

export async function getOrganizationContext(
	ctx: any,
	options?: AutumnOptions,
) {
	if (!scopeContainsOrg({ options }) && !options?.identify) {
		return {
			activeOrganizationId: null,
			activeOrganization: null,
			activeOrganizationEmail: null,
		};
	}

	try {
		const session = await getSessionFromCtx(ctx as any);
		const orgId = session?.session.activeOrganizationId;

		if (orgId && session) {
			// Check if user is a member of the organization
			const [member, organization] = await Promise.all([
				ctx.context.adapter.findOne({
					model: "member",
					where: [
						{ field: "userId", value: session.user.id },
						{ field: "organizationId", value: orgId },
					],
				}),
				ctx.context.adapter.findOne({
					model: "organization",
					where: [{ field: "id", value: orgId }],
				}),
			]);

			// console.log("[org context] member: ", member);

			if (!member) {
				return {
					activeOrganizationId: null,
					activeOrganization: null,
					activeOrganizationEmail: null,
				};
			}

			const creatorRole = ctx.context.orgOptions?.creatorRole || "owner";
			let ownerUserId =
				(member as any).role === creatorRole ? (member as any).userId : null;
			let owner = null;
			if ((member as any).role !== creatorRole) {
				const ownerMembers = await ctx.context.adapter.findMany({
					model: "member",
					where: [
						{ field: "organizationId", value: orgId },
						{ field: "role", value: creatorRole },
					],
				});
				ownerUserId =
					ownerMembers.length > 0 ? (ownerMembers[0] as any).userId : null;
			}

			if (ownerUserId) {
				const ownerUser = await ctx.context.adapter.findOne({
					model: "user",
					where: [{ field: "id", value: ownerUserId }],
				});
				owner = ownerUser;
			}

			// console.log("[org context] organization: ", organization);
			// console.log("[org context] ownerEmail: ", (owner as any)?.email);

			return {
				activeOrganizationId: orgId,
				activeOrganization: organization,
				activeOrganizationEmail: (owner as any)?.email,
			};
		}

		return {
			activeOrganizationId: null,
			activeOrganization: null,
			activeOrganizationEmail: null,
		};
	} catch (error) {
		// If there's any error (like no session), just return null values
		console.log("[org context error]", error);
		return {
			activeOrganizationId: null,
			activeOrganization: null,
			activeOrganizationEmail: null,
		};
	}
}

export async function getIdentityContext({
	orgContext,
	options,
	session,
}: {
	orgContext: any;
	options?: AutumnOptions;
	session?: any;
}) {
	if (!options?.identify) return null;

	const orgData = orgContext.activeOrganization?.id
		? ({
				...orgContext.activeOrganization,
				ownerEmail: orgContext.activeOrganizationEmail as string | null,
			} as Organization & { ownerEmail: string | null })
		: null;

	try {
		const identity = await options.identify({
			session,
			organization: orgData,
		});
		return identity;
	} catch (error) {
		console.log("[identity context error]", error);
		return null;
	}
}
