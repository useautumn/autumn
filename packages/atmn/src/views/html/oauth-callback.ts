// HTML templates for OAuth callback pages

/** Shared styles matching Autumn's theme with dark mode support */
export const BASE_STYLES = `
	@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap');
	
	* {
		box-sizing: border-box;
		margin: 0;
		padding: 0;
	}
	
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
	
	@media (prefers-color-scheme: dark) {
		body {
			background: #161616;
			color: #ddd;
		}
	}
	
	.container {
		text-align: center;
		padding: 3rem 2rem;
		max-width: 400px;
	}
	
	.icon-container {
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
		box-shadow: 0 2px 4px rgba(136, 56, 255, 0.15);
	}
	
	@media (prefers-color-scheme: dark) {
		.icon-success {
			background: linear-gradient(135deg, #2d1f4e 0%, #3d2a5e 100%);
			border: 2px solid #6b46c1;
		}
	}
	
	.icon-error {
		background: linear-gradient(135deg, #fee2e2 0%, #fecaca 100%);
		border: 2px solid #fca5a5;
		box-shadow: 0 2px 4px rgba(220, 38, 38, 0.15);
	}
	
	@media (prefers-color-scheme: dark) {
		.icon-error {
			background: linear-gradient(135deg, #4a1a1a 0%, #5c2020 100%);
			border: 2px solid #dc2626;
		}
	}
	
	.icon-success svg {
		color: #8838ff;
	}
	
	@media (prefers-color-scheme: dark) {
		.icon-success svg {
			color: #a855f7;
		}
	}
	
	.icon-error svg {
		color: #dc2626;
	}
	
	@media (prefers-color-scheme: dark) {
		.icon-error svg {
			color: #f87171;
		}
	}
	
	h1 {
		font-size: 20px;
		font-weight: 600;
		margin-bottom: 0.5rem;
		letter-spacing: -0.02em;
	}
	
	.success h1 {
		color: #121212;
	}
	
	@media (prefers-color-scheme: dark) {
		.success h1 {
			color: #ddd;
		}
	}
	
	.error h1 {
		color: #dc2626;
	}
	
	@media (prefers-color-scheme: dark) {
		.error h1 {
			color: #f87171;
		}
	}
	
	.description {
		font-size: 14px;
		font-weight: 450;
		color: #666;
		line-height: 1.5;
		margin-bottom: 1.5rem;
	}
	
	@media (prefers-color-scheme: dark) {
		.description {
			color: #999;
		}
	}
	
	.hint {
		font-size: 13px;
		font-weight: 450;
		color: #888;
		padding: 0.75rem 1rem;
		background: #f5f5f4;
		border-radius: 8px;
		border: 1px solid #e5e5e5;
	}
	
	@media (prefers-color-scheme: dark) {
		.hint {
			color: #888;
			background: #1d1d1d;
			border: 1px solid #2c2c2c;
		}
	}
	
	.footer {
		position: fixed;
		bottom: 1.5rem;
		left: 50%;
		transform: translateX(-50%);
	}
	
	.footer-card {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 12px;
		font-weight: 500;
		color: #888;
		padding: 0.5rem 0.75rem;
		background: #f5f5f4;
		border-radius: 6px;
		border: 1px solid #e5e5e5;
	}
	
	@media (prefers-color-scheme: dark) {
		.footer-card {
			color: #777;
			background: #1d1d1d;
			border: 1px solid #2c2c2c;
		}
	}
`;

/** Generate success HTML page for OAuth callback */
export function getSuccessHtml(): string {
	return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>Authorization Successful - Autumn</title>
	<style>${BASE_STYLES}</style>
</head>
<body>
	<div class="container success">
		<div class="icon-container icon-success">
			<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
				<polyline points="20 6 9 17 4 12"></polyline>
			</svg>
		</div>
		<h1>Authorization Successful</h1>
		<p class="description">Your CLI has been authenticated successfully.</p>
		<p class="hint">You can close this window and return to your terminal.</p>
	</div>
	<div class="footer">
		<div class="footer-card">
			<img src="https://app.useautumn.com/logo_hd.png" alt="Autumn" width="16" height="16" style="border-radius: 4px;">
			Autumn
		</div>
	</div>
</body>
</html>`;
}

/** Generate error HTML page for OAuth callback */
export function getErrorHtml(errorMessage: string): string {
	// Escape HTML to prevent XSS
	const safeMessage = errorMessage
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#039;");

	return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>Authorization Failed - Autumn</title>
	<style>${BASE_STYLES}</style>
</head>
<body>
	<div class="container error">
		<div class="icon-container icon-error">
			<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
				<line x1="18" y1="6" x2="6" y2="18"></line>
				<line x1="6" y1="6" x2="18" y2="18"></line>
			</svg>
		</div>
		<h1>Authorization Failed</h1>
		<p class="description">${safeMessage}</p>
		<p class="hint">Please close this window and try again in your terminal.</p>
	</div>
	<div class="footer">
		<div class="footer-card">
			<img src="https://app.useautumn.com/logo_hd.png" alt="Autumn" width="16" height="16" style="border-radius: 4px;">
			Autumn
		</div>
	</div>
</body>
</html>`;
}
