const DEFAULT_NET_TERMS_DAYS = 30;

/** The terms typed or picked from a template, else the sheet's default, else 30 days. */
export const resolveNetTermsDays = ({
	netTermsDays,
	defaultNetTermsDays,
}: {
	netTermsDays: number | null;
	defaultNetTermsDays?: number;
}): number => netTermsDays ?? defaultNetTermsDays ?? DEFAULT_NET_TERMS_DAYS;
