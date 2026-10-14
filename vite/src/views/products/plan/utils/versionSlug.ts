import { type FrontendProduct, idRegex } from "@autumn/shared";
import { versionLabel } from "../components/versionLabel";

type VersionedProduct = Pick<FrontendProduct, "version" | "version_slug">;

export const versionSlugRenamed = ({
	product,
	previous,
}: {
	product: VersionedProduct;
	previous?: VersionedProduct | null;
}): boolean => {
	if (!previous) return false;
	const next = product.version_slug?.trim();
	if (!next) return false;
	return (
		next !==
		versionLabel({
			versionSlug: previous.version_slug,
			version: previous.version,
		})
	);
};

export const versionSlugError = ({ slug }: { slug: string }): string | null => {
	if (slug.trim().length === 0) return "Enter a version slug.";
	if (!idRegex.test(slug)) {
		return "Use letters, numbers, dashes or underscores only.";
	}
	return null;
};

export const mintVersionSlugError = ({
	slug,
}: {
	slug: string;
}): string | null => {
	const trimmed = slug.trim();
	if (trimmed.length === 0) return null;
	return versionSlugError({ slug: trimmed });
};
