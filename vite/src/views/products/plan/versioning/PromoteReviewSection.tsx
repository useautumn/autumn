const VersionSlug = ({ slug }: { slug: string }) => (
	<span className="font-mono font-medium text-foreground">{slug}</span>
);

export function PromoteReviewSection({
	preview,
}: {
	preview?: {
		version_slug: string;
		promotion_details?: { previous_active_version_slug: string };
	};
}) {
	const details = preview?.promotion_details;
	if (!preview || !details) return null;

	return (
		<div className="rounded-lg bg-secondary/40 px-3 py-2.5 text-sm text-muted-foreground">
			<VersionSlug slug={preview.version_slug} /> becomes the active version of
			this plan. Attaching by plan ID will use it instead of{" "}
			<VersionSlug slug={details.previous_active_version_slug} />. Existing
			customers stay on their current version.
		</div>
	);
}
