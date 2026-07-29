const BLOCK = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/;
const FIELD = /^([A-Za-z0-9_-]+):\s*(.*)$/;

/** Parse simple `key: value` frontmatter plus the remaining body. */
export const parseFrontmatter = ({
	path,
	text,
}: {
	path: string;
	text: string;
}): { data: Record<string, string>; body: string } => {
	const match = text.match(BLOCK);
	if (!match) {
		throw new Error(`Missing frontmatter in ${path}`);
	}
	const data: Record<string, string> = {};
	for (const line of (match[1] ?? "").split("\n")) {
		if (!line.trim()) {
			continue;
		}
		const field = line.match(FIELD);
		if (field?.[1]) {
			data[field[1]] = (field[2] ?? "").replace(/^['"]|['"]$/g, "").trim();
		}
	}
	return { data, body: (match[2] ?? "").trim() };
};
