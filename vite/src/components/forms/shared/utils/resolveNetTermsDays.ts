const DEFAULT_NET_TERMS_DAYS = 30;

export const resolveNetTermsDays = ({
	netTermsDays,
	defaultNetTermsDays,
}: {
	netTermsDays: number | null;
	defaultNetTermsDays?: number;
}): number => netTermsDays ?? defaultNetTermsDays ?? DEFAULT_NET_TERMS_DAYS;
