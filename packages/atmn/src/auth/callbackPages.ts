/** Ported from v2 so the browser half of login looks unchanged. */
const BASE_STYLES = `
	@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap');

	* { box-sizing: border-box; margin: 0; padding: 0; }

	body {
		font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
		min-height: 100vh;
		display: flex;
		align-items: center;
		justify-content: center;
		background: #fafaf9;
		color: #121212;
		-webkit-font-smoothing: antialiased;
		-moz-osx-font-smoothing: grayscale;
	}

	.container { text-align: center; padding: 3rem 2rem; max-width: 400px; }

	.icon {
		width: 64px;
		height: 64px;
		border-radius: 16px;
		display: flex;
		align-items: center;
		justify-content: center;
		margin: 0 auto 1.5rem;
	}

	.icon-success {
		background: linear-gradient(135deg, #f3e8ff 0%, #ede1ff 100%);
		border: 2px solid #c4b5fd;
		color: #8838ff;
	}

	.icon-error {
		background: linear-gradient(135deg, #fee2e2 0%, #fecaca 100%);
		border: 2px solid #fca5a5;
		color: #dc2626;
	}

	h1 { font-size: 20px; font-weight: 600; margin-bottom: 0.5rem; letter-spacing: -0.02em; }
	.error h1 { color: #dc2626; }

	.description { font-size: 14px; color: #666; line-height: 1.5; margin-bottom: 1.5rem; }

	.hint {
		font-size: 13px;
		color: #888;
		padding: 0.75rem 1rem;
		background: #f5f5f4;
		border-radius: 8px;
		border: 1px solid #e5e5e5;
	}

	@media (prefers-color-scheme: dark) {
		body { background: #161616; color: #ddd; }
		.icon-success { background: linear-gradient(135deg, #2d1f4e 0%, #3d2a5e 100%); border-color: #6b46c1; color: #a855f7; }
		.icon-error { background: linear-gradient(135deg, #4a1a1a 0%, #5c2020 100%); border-color: #dc2626; color: #f87171; }
		.error h1 { color: #f87171; }
		.description { color: #999; }
		.hint { background: #1d1d1d; border-color: #2c2c2c; }
	}
`;

const SUCCESS_ICON = `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;

const ERROR_ICON = `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;

const renderPage = ({
	variant,
	icon,
	title,
	description,
	hint,
}: {
	variant: "success" | "error";
	icon: string;
	title: string;
	description: string;
	hint: string;
}): string => `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>${title} - Autumn</title>
	<style>${BASE_STYLES}</style>
</head>
<body>
	<div class="container ${variant}">
		<div class="icon icon-${variant}">${icon}</div>
		<h1>${title}</h1>
		<p class="description">${description}</p>
		<p class="hint">${hint}</p>
	</div>
</body>
</html>`;

/** The error text comes from the authorization server, so it must be escaped. */
const escapeHtml = ({ text }: { text: string }): string =>
	text
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&#039;");

export const renderSuccessPage = (): string =>
	renderPage({
		variant: "success",
		icon: SUCCESS_ICON,
		title: "Authorization Successful",
		description: "Your CLI has been authenticated successfully.",
		hint: "You can close this window and return to your terminal.",
	});

export const renderErrorPage = ({ message }: { message: string }): string =>
	renderPage({
		variant: "error",
		icon: ERROR_ICON,
		title: "Authorization Failed",
		description: escapeHtml({ text: message }),
		hint: "Please close this window and try again in your terminal.",
	});
