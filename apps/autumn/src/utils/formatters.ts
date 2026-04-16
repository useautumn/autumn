const NUMBER_FORMATTER = new Intl.NumberFormat("en-US");

export function formatNumber(n: number): string {
	return NUMBER_FORMATTER.format(n);
}

const DURATION_MS = {
	h: 3_600_000,
	d: 86_400_000,
	w: 604_800_000,
	m: 2_592_000_000,
} as const;

const DURATION_RE = /^(\d+)\s*([hdwm])$/i;

export function parseDuration(input: string): number | null {
	const match = DURATION_RE.exec(input.trim());
	if (!match) return null;

	const value = Number.parseInt(match[1], 10);
	const unit = match[2].toLowerCase() as keyof typeof DURATION_MS;
	const multiplier = DURATION_MS[unit];
	return multiplier ? value * multiplier : null;
}
