import { isMock, transport } from "../api/client.ts";
import { Button } from "../components/ui.tsx";

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
		<div className="flex min-h-dvh items-center justify-center bg-background px-6">
			<div className="w-full max-w-[340px]">
				<div className="flex items-center gap-2 text-[13px] font-[550] text-foreground">
					<span className="flex size-5 items-center justify-center rounded-md bg-foreground font-mono text-[10px] text-background">
						tw
					</span>
					twd
				</div>
				<h1 className="mt-6 text-md font-semibold text-balance text-foreground">
					Sign in to the test swarm
				</h1>
				<p className="mt-1 text-sm text-pretty text-tertiary-foreground">
					Start and watch <span className="font-mono">bun tw</span> runs, manage
					Stripe keys and account reservations.
				</p>
				<Button variant="secondary" onClick={signIn} className="mt-6 w-full">
					<GoogleMark />
					Continue with Google
				</Button>
				<p className="mt-3 text-center text-xs text-subtle">
					Restricted to verified{" "}
					<span className="font-mono">@useautumn.com</span> accounts.
				</p>
				<div className="mt-8 border-t pt-3 text-xs text-tertiary-foreground">
					Agents and CI: use an API key with{" "}
					<span className="font-mono text-foreground">
						Authorization: Bearer twd_…
					</span>
				</div>
			</div>
		</div>
	);
};
