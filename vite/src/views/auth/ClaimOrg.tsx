import { Button } from "@autumn/ui";
import { Navigate, useSearchParams } from "react-router";
import LoadingScreen from "../general/LoadingScreen";
import { AuthBackground } from "./components/AuthBackground";
import { AutumnWordmark } from "./components/AutumnWordmark";
import { ClaimFooter } from "./components/ClaimFooter";
import { useAgentClaim } from "./useAgentClaim";

const ClaimUnavailable = () => (
	<AuthBackground>
		<div className="flex flex-col items-center gap-3 text-center">
			<AutumnWordmark className="h-7 w-auto text-foreground" />
			<p className="text-sm text-muted-foreground">
				This claim link has expired or has already been used.
			</p>
		</div>
	</AuthBackground>
);

const copy = {
	add: {
		lead: "This organization will be added to your account.",
		action: "Claim organization",
	},
	switch: {
		lead: "This organization will be added to your account and become active.",
		action: "Claim and switch",
	},
} as const;

export const ClaimOrg = () => {
	const [searchParams] = useSearchParams();
	const token = searchParams.get("token") ?? "";
	const {
		session,
		sessionPending,
		details,
		mode,
		completion,
		signInPath,
		switchAccount,
	} = useAgentClaim({ token });

	if (!token) return <ClaimUnavailable />;
	if (sessionPending) return <LoadingScreen fullPage />;
	if (!session) return <Navigate to={signInPath} replace />;
	if (details.isPending) return <LoadingScreen fullPage />;
	if (details.isError || !details.data) return <ClaimUnavailable />;

	const { organization } = details.data;
	const isBusy = completion.isPending || completion.isSuccess;

	return (
		<AuthBackground>
			<div className="flex flex-col items-center gap-6">
				<div className="flex flex-col items-center gap-3 text-center">
					<AutumnWordmark className="h-7 w-auto text-foreground" />
					<p className="min-h-10 text-balance text-sm leading-5 text-muted-foreground">
						{copy[mode].lead}
					</p>
				</div>

				<div className="w-full space-y-3">
					<div className="rounded-lg border border-border bg-muted/30 px-3 py-2.5">
						<p className="truncate text-sm font-medium">{organization.name}</p>
						<p className="truncate text-xs text-muted-foreground">
							{organization.slug}
						</p>
					</div>

					<Button
						className="w-full"
						isLoading={isBusy}
						onClick={() => completion.mutate()}
					>
						{copy[mode].action}
					</Button>

					<ClaimFooter
						email={session.user.email}
						hasError={completion.isError}
						isBusy={isBusy}
						onSwitchAccount={switchAccount}
					/>
				</div>
			</div>
		</AuthBackground>
	);
};
