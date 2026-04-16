export const cn = (...inputs: Array<string | false | null | undefined>) =>
	inputs.filter(Boolean).join(" ");
