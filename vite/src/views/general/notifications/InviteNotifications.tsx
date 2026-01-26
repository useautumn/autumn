import type { FullInvite } from "@autumn/shared";
import { format, isSameYear } from "date-fns";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/v2/buttons/Button";
import { useInvitesQuery } from "@/hooks/queries/useInvitesQuery";
import { authClient } from "@/lib/auth-client";

export const InviteNotifications = () => {
	const [loading, setLoading] = useState(false);
	const [inviteStatus, setInviteStatus] = useState<
		Map<string, "unavailable" | "dismissed">
	>(new Map());
	const { invites, refetch } = useInvitesQuery();

	const handleRespondToRequest = async (
		invite: FullInvite,
		action: "accept" | "reject",
	) => {
		try {
			setLoading(true);

			if (action === "accept") {
				const { error } = await authClient.organization.acceptInvitation({
					invitationId: invite.id,
				});

				if (error) throw error;

				// Switch to that org
				await authClient.organization.setActive({
					organizationId: invite.organization.id,
				});

				window.location.reload();
			} else {
				await authClient.organization.rejectInvitation({
					invitationId: invite.id,
				});
				toast.success(`Invitation rejected successfully`);
			}
			await refetch();
		} catch (_error) {
			setInviteStatus((prev) => new Map(prev).set(invite.id, "unavailable"));
		} finally {
			setLoading(false);
		}
	};

	const handleDismiss = (inviteId: string) => {
		setInviteStatus((prev) => new Map(prev).set(inviteId, "dismissed"));
	};

	const visibleInvites = invites.filter(
		(invite) => inviteStatus.get(invite.id) !== "dismissed",
	);

	if (visibleInvites.length === 0) return null;

	return createPortal(
		<div className="fixed bottom-6 right-6 z-50 space-y-3 max-w-sm">
			<AnimatePresence mode="popLayout">
				{visibleInvites.map((invite: FullInvite, index) => {
					const isUnavailable = inviteStatus.get(invite.id) === "unavailable";
					const expiresAt = new Date(invite.expiresAt);
					const expiresAtFormatted = format(
						expiresAt,
						isSameYear(expiresAt, new Date())
							? "MMM d, h:mm a"
							: "MMM d, yyyy, h:mm a",
					);

					return (
						<motion.div
							key={invite.id}
							initial={{
								opacity: 0,
								scale: 0.8,
								y: -50,
								x: 100,
							}}
							animate={{
								opacity: 1,
								scale: 1,
								y: 0,
								x: 0,
							}}
							exit={{
								opacity: 0,
								scale: 0.8,
								x: 100,
								transition: { duration: 0.2 },
							}}
							transition={{
								type: "spring",
								bounce: 0.3,
								duration: 0.6,
								delay: index * 0.1,
							}}
							layout
						>
							<div className="rounded-md border bg-background p-4 shadow-lg">
								{isUnavailable ? (
									<div className="space-y-3">
										<p className="text-sm font-medium">
											Invitation Unavailable
										</p>
										<p className="text-sm text-t3">
											This invitation has expired or been revoked.
										</p>
										<Button
											variant="secondary"
											className="w-full"
											onClick={() => handleDismiss(invite.id)}
										>
											Dismiss
										</Button>
									</div>
								) : (
									<div className="space-y-3">
										<div className="flex items-center justify-between">
											<p className="text-sm font-medium">
												Organization Invitation
											</p>
											<p className="text-xs text-t3">
												Expires {expiresAtFormatted}
											</p>
										</div>

										<p className="text-sm text-t2">
											<span className="font-medium text-t1">
												{invite.inviter.name || "Someone"}
											</span>{" "}
											invited you to join{" "}
											<span className="font-medium text-t1">
												{invite.organization.name}
											</span>{" "}
											as <Badge variant="outline">{invite.role}</Badge>
										</p>

										<div className="flex gap-2">
											<Button
												variant="secondary"
												className="flex-1"
												onClick={() => handleRespondToRequest(invite, "reject")}
												disabled={loading}
											>
												Decline
											</Button>
											<Button
												variant="primary"
												className="flex-1"
												onClick={() => handleRespondToRequest(invite, "accept")}
												disabled={loading}
											>
												Accept
											</Button>
										</div>
									</div>
								)}
							</div>
						</motion.div>
					);
				})}
			</AnimatePresence>
		</div>,
		document.body,
	);
};
