import { useMutation } from "@tanstack/react-query";
import { useSyncExternalStore } from "react";
import { toast } from "sonner";
import { useOrg } from "@/hooks/common/useOrg";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { getBackendErr } from "@/utils/genUtils";

export type SlackInviteState =
	| { status: "idle" }
	| { status: "requested"; email: string }
	| { status: "dismissed" };

const IDLE_STATE: SlackInviteState = { status: "idle" };

const storageKey = ({ orgId }: { orgId: string }) =>
	`autumn_slack_invite_${orgId}`;

/** Raw strings are what's compared between reads, so `useSyncExternalStore`
 * sees a stable snapshot until something is actually written. */
const readRaw = ({ orgId }: { orgId: string }): string | null => {
	try {
		return localStorage.getItem(storageKey({ orgId }));
	} catch {
		return null;
	}
};

const parseState = (raw: string | null): SlackInviteState => {
	if (!raw) return IDLE_STATE;
	try {
		return JSON.parse(raw) as SlackInviteState;
	} catch {
		return IDLE_STATE;
	}
};

// The sidebar menu and the onboarding card are mounted together, so a write
// from one has to reach the other.
const listeners = new Set<() => void>();

const subscribe = (listener: () => void) => {
	listeners.add(listener);
	return () => listeners.delete(listener);
};

const writeState = ({
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
	for (const listener of listeners) listener();
};

/** Requests a Slack Connect invite to the org's shared channel for the
 * signed-in user. Slack emails the invite itself. */
export const useSlackInvite = () => {
	const { org } = useOrg();
	const axiosInstance = useAxiosInstance();
	const orgId = org?.id;

	const raw = useSyncExternalStore(subscribe, () =>
		orgId ? readRaw({ orgId }) : null,
	);
	const state = parseState(raw);

	const setState = (next: SlackInviteState) => {
		if (orgId) writeState({ orgId, state: next });
	};

	const mutation = useMutation({
		mutationFn: async ({ channelName }: { channelName: string }) => {
			const { data } = await axiosInstance.post<{ email: string }>(
				"/slack_connect/invite",
				{ channel_name: channelName },
			);
			return data;
		},
		onSuccess: ({ email }) => {
			setState({ status: "requested", email });
		},
		onError: (error) => {
			toast.error(getBackendErr(error, "Failed to send the Slack invite"));
		},
	});

	return {
		isReady: !!orgId,
		state,
		requestInvite: mutation.mutateAsync,
		isRequesting: mutation.isPending,
		dismiss: () => setState({ status: "dismissed" }),
	};
};
