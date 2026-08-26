import { Input } from "@autumn/ui";
import { ConfigRow } from "@/components/forms/shared/ConfigRow";
import { useProduct } from "@/components/v2/inline-custom-plan-editor/PlanEditorContext";
import { versionSlugError } from "../../utils/versionSlug";
import { defaultVersionSlug } from "../versionLabel";

export const VersionSlugField = () => {
	const { product, setProduct } = useProduct();
	const fallbackSlug = defaultVersionSlug({ version: product.version });
	// Only an unset slug falls back; a cleared one stays empty so it can be retyped.
	const slug = product.version_slug ?? fallbackSlug;
	const error = versionSlugError({ slug });

	return (
		<ConfigRow
			title="Version slug"
			description="Names this version in the API and dashboard. Other versions keep theirs."
		>
			<Input
				aria-invalid={!!error}
				onChange={(event) =>
					setProduct({ ...product, version_slug: event.target.value })
				}
				placeholder={fallbackSlug}
				value={slug}
			/>
			{error && (
				<p className="mt-1 text-xs text-destructive" role="alert">
					{error}
				</p>
			)}
		</ConfigRow>
	);
};
