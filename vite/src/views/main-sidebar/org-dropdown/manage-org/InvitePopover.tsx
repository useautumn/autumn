import type { Role } from "@autumn/shared";
import {
	Button,
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	FormLabel,
	Input,
	ShortcutButton,
} from "@autumn/ui";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { z } from "zod/v4";
import { RoleSelect } from "@/components/v2/selects/RoleSelect";
import { authClient } from "@/lib/auth-client";
import { getBackendErr } from "@/utils/genUtils";
import { useMemberships } from "../hooks/useMemberships";

const emailSchema = z.email();

const INVITE_ROLES: Role[] = ["owner", "admin", "developer", "sales", "member"];

export const InvitePopover = () => {
	const [email, setEmail] = useState("");
	const [role, setRole] = useState<Role>("developer");
	const [loading, setLoading] = useState(false);
	const [open, setOpen] = useState(false);
	const { refetch } = useMemberships();
	const emailInputRef = useRef<HTMLInputElement>(null);

	const handleInvite = async () => {
		if (!email || !emailSchema.safeParse(email).success) {
			toast.error("Please enter a valid email address.");
			return;
		}
		try {
			setLoading(true);
			const { error } = await authClient.organization.inviteMember({
				email: email,
				role: role,
				resend: true,
			});
			if (error) {
				toast.error(error.message);
				return;
			}
			await refetch();
			toast.success(`Successfully sent invitation to ${email}`);
			setEmail("");
			setRole("developer");
			setOpen(false);
		} catch (error) {
			console.error(error);
			toast.error(getBackendErr(error, "Failed to invite user"));
		} finally {
			setLoading(false);
		}
	};

	return (
		<>
			<Button variant="primary" onClick={() => setOpen(true)}>
				Invite
			</Button>
			<Dialog
				open={open}
				onOpenChange={(val) => {
					setOpen(val);
					if (val) {
						setTimeout(() => emailInputRef.current?.focus(), 0);
					}
				}}
			>
				<DialogContent className="w-[400px] bg-card">
					<DialogHeader>
						<DialogTitle>Invite Member</DialogTitle>
						<DialogDescription>
							Send an invitation to join this organization.
						</DialogDescription>
					</DialogHeader>
					<div className="flex flex-col gap-3">
						<div>
							<FormLabel>
								<span className="text-muted-foreground">Email</span>
							</FormLabel>
							<input
								type="email"
								name="dummy-email-sink"
								tabIndex={-1}
								aria-hidden="true"
								style={{
									position: "absolute",
									top: 0,
									left: 0,
									opacity: 0,
									height: 0,
									width: 0,
									pointerEvents: "none",
								}}
							/>
							<Input
								ref={emailInputRef}
								placeholder="jane@example.com"
								value={email}
								onChange={(e) => setEmail(e.target.value)}
								autoComplete="off"
								name={`invitee-${Math.random().toString(36).slice(2, 10)}`}
								type="text"
								inputMode="email"
								spellCheck={false}
								data-1p-ignore
								data-lpignore="true"
								data-bwignore="true"
								data-form-type="other"
							/>
						</div>
						<div>
							<FormLabel>
								<span className="text-muted-foreground">Role</span>
							</FormLabel>
							<RoleSelect
								value={role}
								onChange={setRole}
								allowed={INVITE_ROLES}
								className="w-full"
							/>
						</div>
					</div>
					<DialogFooter>
						<ShortcutButton
							variant="primary"
							onClick={handleInvite}
							isLoading={loading}
							metaShortcut="enter"
							disabled={!email.trim()}
							className="w-full"
						>
							Send Invite
						</ShortcutButton>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	);
};
