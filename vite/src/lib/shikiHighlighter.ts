import { codeToHtml } from "shiki";

/**
 * Highlights code using Shiki with theme support
 */
export async function highlightCode({
	code,
	language,
	isDark,
}: {
	code: string;
	language: string;
	isDark: boolean;
}): Promise<string> {
	try {
		const html = await codeToHtml(code, {
			lang: language,
			theme: isDark ? "github-dark" : "github-light",
		});

		return html;
	} catch (error) {
		console.error("Shiki highlighting error:", error);
		// Fallback: return plain code wrapped in pre/code tags
		return `<pre><code>${escapeHtml(code)}</code></pre>`;
	}
}

/**
 * Escape HTML to prevent XSS in fallback case
 */
function escapeHtml(unsafe: string): string {
	return unsafe
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#039;");
}

