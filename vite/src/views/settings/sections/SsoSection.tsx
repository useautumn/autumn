import { Button, Skeleton } from "@autumn/ui";
import { useState } from "react";
import { toast } from "sonner";
import { useAutumnFlags } from "@/hooks/common/useAutumnFlags";
import { useSsoConnectionQuery } from "@/hooks/queries/useSsoConnectionQuery";
import { getBackendErr } from "@/utils/genUtils";
import { SettingsSection } from "../SettingsSection";
import { DeleteSsoConnectionDialog } from "./components/sso/DeleteSsoConnectionDialog";
import { SsoActiveCard } from "./components/sso/SsoActiveCard";
import { SsoDomainVerificationCard } from "./components/sso/SsoDomainVerificationCard";
import { SsoEmptyState } from "./components/sso/SsoEmptyState";
import { SsoSetupForm } from "./components/sso/SsoSetupForm";
import { SsoValidatingCard } from "./components/sso/SsoValidatingCard";
import { useSsoActions } from "./components/sso/useSsoActions";

export const SsoSection = () => {
	const { sso } = useAutumnFlags();
	const { connection, callbackUrl, isLoading, error, refetch } =
		useSsoConnectionQuery({
			enabled: sso,
		});
	const { create, verifyDomain, remove, testSignIn } = useSsoActions();
	const [showForm, setShowForm] = useState(false);
	const [deleteOpen, setDeleteOpen] = useState(false);

	if (!sso) return null;

	const handleDelete = async () => {
		try {
			await remove.mutateAsync();
			setDeleteOpen(false);
			setShowForm(false);
			toast.success("SSO connection deleted");
		} catch (err) {
			toast.error(getBackendErr(err, "Failed to delete the SSO connection"));
		}
	};

	const deleteButton = (
		<Button
			variant="destructive"
			onClick={() => setDeleteOpen(true)}
			disabled={remove.isPending}
		>
			{connection?.status === "active"
				? "Delete connection"
				: "Delete and start over"}
		</Button>
	);

	const renderContent = () => {
		if (isLoading) {
			return (
				<div className="flex flex-col gap-3" aria-busy="true">
					<Skeleton className="h-5 w-48" aria-label="Loading" />
					<Skeleton className="h-24 w-full" aria-label="Loading" />
				</div>
			);
		}

		if (error) {
			return (
				<div
					role="alert"
					className="flex flex-col items-start gap-3 rounded-lg border bg-background p-4"
				>
					<p className="text-sm text-tertiary-foreground">
						We couldn't load your SSO connection.
					</p>
					<Button variant="secondary" onClick={() => refetch()}>
						Try again
					</Button>
				</div>
			);
		}

		if (!connection) {
			return showForm ? (
				<SsoSetupForm
					create={create}
					callbackUrl={callbackUrl}
					onCancel={() => setShowForm(false)}
				/>
			) : (
				<SsoEmptyState
					callbackUrl={callbackUrl}
					onStart={() => setShowForm(true)}
				/>
			);
		}

		if (connection.status === "pending_domain_verification") {
			return (
				<SsoDomainVerificationCard
					connection={connection}
					callbackUrl={callbackUrl}
					verifyDomain={verifyDomain}
					onDelete={deleteButton}
				/>
			);
		}

		if (connection.status === "validating") {
			return (
				<SsoValidatingCard
					connection={connection}
					callbackUrl={callbackUrl}
					testSignIn={testSignIn}
					onDelete={deleteButton}
				/>
			);
		}

		return (
			<SsoActiveCard
				connection={connection}
				callbackUrl={callbackUrl}
				onDelete={deleteButton}
			/>
		);
	};

	return (
		<SettingsSection
			title="Single sign-on"
			description="Let your team sign in to Autumn with your OIDC identity provider"
		>
			{renderContent()}
			{connection && (
				<DeleteSsoConnectionDialog
					domain={connection.domain}
					open={deleteOpen}
					onOpenChange={setDeleteOpen}
					onConfirm={handleDelete}
					isDeleting={remove.isPending}
				/>
			)}
		</SettingsSection>
	);
};
