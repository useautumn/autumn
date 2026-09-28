import { isMock, transport } from "../api/client.ts";

const GoogleMark = () => (
	<svg viewBox="0 0 24 24" className="size-4" role="img" aria-label="Google">
		<title>Google</title>
		<path
			fill="#4285F4"
			d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.3-2.1 3.5-5.2 3.5-8.8Z"
		/>
		<path
			fill="#34A853"
			d="M12 24c3.2 0 6-1.1 8-2.9l-3.9-3c-1.1.7-2.5 1.2-4.1 1.2-3.1 0-5.8-2.1-6.7-5H1.3v3.1A12 12 0 0 0 12 24Z"
		/>
		<path
			fill="#FBBC05"
			d="M5.3 14.3a7.2 7.2 0 0 1 0-4.6V6.6h-4a12 12 0 0 0 0 10.8l4-3.1Z"
		/>
		<path
			fill="#EA4335"
			d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.3 6.6l4 3.1c.9-2.9 3.6-4.9 6.7-4.9Z"
		/>
	</svg>
);

export const SignInScreen = () => {
	const signIn = () => {
		if (!isMock) return window.location.assign(transport.signInUrl);
		localStorage.removeItem("twd-mock-signed-out");
		window.location.assign("/");
	};
	return (
		<div className="flex min-h-dvh items-center justify-center px-6">
			<div className="w-full max-w-[340px]">
				<div className="flex items-center gap-2 font-mono text-sm font-semibold">
					<span className="flex size-6 items-center justify-center rounded bg-accent text-[11px] text-accent-fg">
						tw
					</span>
					twd
				</div>
				<h1 className="mt-6 text-xl font-semibold text-balance">
					Sign in to the test swarm
				</h1>
				<p className="mt-1.5 text-[13px] text-pretty text-muted">
					Start and watch <span className="font-mono">bun tw</span> runs, manage
					Stripe keys and account reservations.
				</p>
				<button
					type="button"
					onClick={signIn}
					className="mt-6 flex h-9 w-full cursor-pointer items-center justify-center gap-2.5 rounded-md border border-line bg-surface text-[13px] font-medium shadow-xs transition-colors outline-none hover:bg-hover focus-visible:ring-2 focus-visible:ring-info/40"
				>
					<GoogleMark />
					Continue with Google
				</button>
				<p className="mt-3 text-center text-xs text-faint">
					Restricted to verified{" "}
					<span className="font-mono">@useautumn.com</span> accounts.
				</p>
				<div className="mt-10 border-t border-line pt-4 text-xs text-muted">
					Agents and CI: use an API key with{" "}
					<span className="font-mono text-fg">Authorization: Bearer twd_…</span>
				</div>
			</div>
		</div>
	);
};
