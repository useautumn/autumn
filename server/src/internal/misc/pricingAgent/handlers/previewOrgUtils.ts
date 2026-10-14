import {
	AppEnv,
	createdAtToVersion,
	type Organization,
	RecaseError,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { FeatureService } from "@/internal/features/FeatureService.js";
import { OrgService } from "@/internal/orgs/OrgService.js";

export function buildPreviewOrgSlug({
	userId,
	masterOrgId,
}: {
	userId: string;
	masterOrgId: string;
}): string {
	return `preview|${userId}|${masterOrgId}`;
}

export async function getSessionPreviewOrg({
	ctx,
}: {
	ctx: AutumnContext;
}): Promise<Organization> {
	const { db, org: masterOrg, userId } = ctx;

	if (!userId) {
		throw new RecaseError({
			message: "User not authenticated",
			code: "unauthenticated",
			statusCode: 401,
		});
	}

	const previewSlug = buildPreviewOrgSlug({
		userId,
		masterOrgId: masterOrg.id,
	});

	const previewOrg = await OrgService.getBySlug({ db, slug: previewSlug });
	if (!previewOrg) {
		throw new RecaseError({
			message: "Preview org not found. Call /preview/setup first.",
			code: "preview_org_not_found",
			statusCode: 404,
		});
	}

	return previewOrg;
}

export async function buildPreviewContext({
	ctx,
	previewOrg,
	withFeatures = false,
}: {
	ctx: AutumnContext;
	previewOrg: Organization;
	withFeatures?: boolean;
}): Promise<AutumnContext> {
	const features = withFeatures
		? await FeatureService.list({
				db: ctx.db,
				orgId: previewOrg.id,
				env: AppEnv.Sandbox,
			})
		: [];

	return {
		...ctx,
		org: previewOrg,
		env: AppEnv.Sandbox,
		features,
		apiVersion: createdAtToVersion({
			createdAt: previewOrg.created_at ?? undefined,
		}),
	};
}
