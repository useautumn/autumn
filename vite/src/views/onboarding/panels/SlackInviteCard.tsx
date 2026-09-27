import { Button } from "@autumn/ui";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { useOrg } from "@/hooks/common/useOrg";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { getBackendErr } from "@/utils/genUtils";

type SlackInviteState =
	| { status: "idle" }
	| { status: "requested"; email: string }
	| { status: "dismissed" };

const storageKey = ({ orgId }: { orgId: string }) =>
	`autumn_slack_invite_${orgId}`;

const readInviteState = ({ orgId }: { orgId: string }): SlackInviteState => {
	try {
		const raw = localStorage.getItem(storageKey({ orgId }));
		return raw ? (JSON.parse(raw) as SlackInviteState) : { status: "idle" };
	} catch {
		return { status: "idle" };
	}
};

const writeInviteState = ({
	orgId,
	state,
}: {
	orgId: string;
	state: SlackInviteState;
}) => {
	try {
		localStorage.setItem(storageKey({ orgId }), JSON.stringify(state));
	} catch {
		// Losing the flag only costs us a re-shown card.
	}
};

function SlackLogo() {
	return (
		<svg
			viewBox="0 0 54 54"
			className="size-7 shrink-0"
			aria-hidden="true"
			focusable="false"
		>
			<path
				fill="#36C5F0"
				d="M19.712.133a5.381 5.381 0 0 0-5.376 5.387 5.381 5.381 0 0 0 5.376 5.386h5.376V5.52A5.381 5.381 0 0 0 19.712.133m0 14.365H5.376A5.381 5.381 0 0 0 0 19.884a5.381 5.381 0 0 0 5.376 5.387h14.336a5.381 5.381 0 0 0 5.376-5.387 5.381 5.381 0 0 0-5.376-5.386"
			/>
			<path
				fill="#2EB67D"
				d="M53.76 19.884a5.381 5.381 0 0 0-5.376-5.386 5.381 5.381 0 0 0-5.376 5.386v5.387h5.376a5.381 5.381 0 0 0 5.376-5.387m-14.336 0V5.52A5.381 5.381 0 0 0 34.048.133a5.381 5.381 0 0 0-5.376 5.387v14.364a5.381 5.381 0 0 0 5.376 5.387 5.381 5.381 0 0 0 5.376-5.387"
			/>
			<path
				fill="#ECB22E"
				d="M34.048 54a5.381 5.381 0 0 0 5.376-5.387 5.381 5.381 0 0 0-5.376-5.386h-5.376v5.386A5.381 5.381 0 0 0 34.048 54m0-14.365h14.336a5.381 5.381 0 0 0 5.376-5.386 5.381 5.381 0 0 0-5.376-5.387H34.048a5.381 5.381 0 0 0-5.376 5.387 5.381 5.381 0 0 0 5.376 5.386"
			/>
			<path
				fill="#E01E5A"
				d="M0 34.249a5.381 5.381 0 0 0 5.376 5.386 5.381 5.381 0 0 0 5.376-5.386v-5.387H5.376A5.381 5.381 0 0 0 0 34.25m14.336-.001v14.364A5.381 5.381 0 0 0 19.712 54a5.381 5.381 0 0 0 5.376-5.387V34.25a5.381 5.381 0 0 0-5.376-5.387 5.381 5.381 0 0 0-5.376 5.387"
			/>
		</svg>
	);
}

/** Offers a Slack Connect channel with the Autumn team. The invite itself is
 * emailed by Slack, so once it's sent the card just points at the inbox. */
export function SlackInviteCard() {
	const { org } = useOrg();
	const axiosInstance = useAxiosInstance();
	const orgId = org?.id;
	// Keyed by org, so switching orgs re-reads instead of carrying state over.
	const [stateByOrg, setStateByOrg] = useState<
		Record<string, SlackInviteState>
	>({});

	const inviteMutation = useMutation({
		mutationFn: async () => {
			const { data } = await axiosInstance.post<{ email: string }>(
				"/slack_connect/invite",
			);
			return data;
		},
		onSuccess: ({ email }) => {
			updateState({ status: "requested", email });
		},
		onError: (error) => {
			toast.error(getBackendErr(error, "Failed to send the Slack invite"));
		},
	});

	if (!orgId) return null;

	const state = stateByOrg[orgId] ?? readInviteState({ orgId });

	function updateState(next: SlackInviteState) {
		if (!orgId) return;
		writeInviteState({ orgId, state: next });
		setStateByOrg((previous) => ({ ...previous, [orgId]: next }));
	}

	if (state.status === "dismissed") return null;

	const isRequested = state.status === "requested";
	const dismiss = () => updateState({ status: "dismissed" });

	return (
		<div className="flex flex-col gap-4 rounded-lg border bg-interactive-secondary px-4 py-3.5 sm:flex-row sm:items-center">
			<div className="flex min-w-0 items-center gap-3">
				<SlackLogo />
				<div className="flex min-w-0 flex-col gap-0.5">
					<span className="text-sm font-medium text-foreground">
						{isRequested
							? "Slack channel invitation requested"
							: "Get a shared Slack channel with our team"}
					</span>
					<span className="text-xs text-muted-foreground">
						{isRequested
							? "Check your email to accept the invitation and join the channel."
							: "Talk to the Autumn team directly while you set up your billing."}
					</span>
				</div>
			</div>
			<div className="flex shrink-0 items-center gap-3 sm:ml-auto">
				{isRequested && (
					<span className="text-xs text-tertiary-foreground">
						Please check your inbox at{" "}
						<span className="font-medium text-foreground">{state.email}</span>
					</span>
				)}
				<Button variant="skeleton" size="sm" onClick={dismiss}>
					Dismiss
				</Button>
				{!isRequested && (
					<Button
						variant="primary"
						size="sm"
						onClick={() => inviteMutation.mutate()}
						isLoading={inviteMutation.isPending}
					>
						Request invite
					</Button>
				)}
			</div>
		</div>
	);
}
