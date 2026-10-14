export const resolveInheritedMarkup = (args: {
	providerMarkup?: number | null;
	defaultMarkup?: number | null;
}): number | undefined =>
	args.providerMarkup ?? args.defaultMarkup ?? undefined;
