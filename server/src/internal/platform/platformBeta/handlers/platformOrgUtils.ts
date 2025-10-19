import type { ApiPlatformOrg } from "@autumn/shared";

/**
 * Remove master org ID prefix from organization slug
 */
function cleanOrgSlug({
	slug,
	orgId,
}: {
	slug: string;
	orgId: string;
}): string {
	let cleanedSlug = slug;
	const prefix = `${orgId}_`;
	if (cleanedSlug.startsWith(prefix)) {
		cleanedSlug = cleanedSlug.slice(prefix.length);
	}
	// Handle the case where slug is prepended with "slug_orgId"
	const altPrefix1 = `_${orgId}`;
	const altPrefix2 = `|${orgId}`;
	if (cleanedSlug.endsWith(altPrefix1)) {
		cleanedSlug = cleanedSlug.slice(0, -altPrefix1.length);
	} else if (cleanedSlug.endsWith(altPrefix2)) {
		cleanedSlug = cleanedSlug = cleanedSlug.slice(0, -altPrefix2.length);
	}
	return cleanedSlug;
}

/**
 * Convert raw org data to ApiPlatformOrg format
 */
export function toPlatformOrg({
	org,
	masterOrgId,
}: {
	org: { slug: string; name: string; createdAt: string | Date };
	masterOrgId: string;
}): ApiPlatformOrg {
	return {
		slug: cleanOrgSlug({ slug: org.slug, orgId: masterOrgId }),
		name: org.name,
		created_at: new Date(org.createdAt).getTime(),
	};
}
