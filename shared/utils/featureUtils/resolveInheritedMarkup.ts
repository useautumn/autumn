/** Inherited markup precedence: a provider-level markup wins, otherwise the global default. Returns undefined when neither is set. */
export const resolveInheritedMarkup = (args: {
	providerMarkup?: number | null;
	defaultMarkup?: number | null;
}): number | undefined => args.providerMarkup ?? args.defaultMarkup ?? undefined;
