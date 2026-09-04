/** Raw event stream, only under AX_EVALS_TRACE=live (default is turn blocks). */
export const trace = (label: string, line: string) => {
	if (process.env.AX_EVALS_TRACE !== "live") return;
	process.stderr.write(`  [${label}] ${line}\n`);
};

export const shortText = (value: unknown, max = 80): string => {
	const text = typeof value === "string" ? value : JSON.stringify(value ?? "");
	const flat = text.replaceAll("\n", " ");
	return flat.length > max ? `${flat.slice(0, max)}…` : flat;
};
