const VersionSlug = ({ slug }: { slug: string }) => (
	<span className="font-mono font-medium text-foreground">{slug}</span>
);

export const VersionSlugChangeNotice = ({
	from,
	to,
}: {
	from?: string;
	to?: string;
}) => {
	if (from === undefined || to === undefined) return null;

	return (
		<div className="rounded-lg bg-secondary/40 px-3 py-2.5 text-sm text-muted-foreground">
			You're renaming this version's slug from <VersionSlug slug={from} /> to{" "}
			<VersionSlug slug={to} />. Calls targeting <VersionSlug slug={from} />{" "}
			will stop resolving; other versions of this plan are unaffected.
		</div>
	);
};
