import { Button, StepBadge } from "@autumn/ui";
import { SsoCallbackUrlField } from "./SsoCallbackUrlField";
import { SsoTextField } from "./SsoTextField";
import type { useSsoActions } from "./useSsoActions";
import { useSsoSetupForm } from "./useSsoSetupForm";

export const SsoSetupForm = ({
	onCancel,
	create,
	callbackUrl,
}: {
	onCancel: () => void;
	create: ReturnType<typeof useSsoActions>["create"];
	callbackUrl: string | null;
}) => {
	const form = useSsoSetupForm({ create });

	return (
		<form
			className="flex flex-col gap-4 rounded-lg border bg-card p-4"
			onSubmit={(e) => {
				e.preventDefault();
				form.handleSubmit();
			}}
		>
			<div className="flex flex-col gap-1.5">
				<div className="flex items-center gap-2">
					<StepBadge>1</StepBadge>
					<span className="text-sm font-medium text-foreground">
						Connect your identity provider
					</span>
				</div>
				<p className="max-w-xl text-sm text-tertiary-foreground">
					Add the callback URL below to your OIDC app in Okta, Entra ID, Auth0
					or Google Workspace, then paste back the issuer and client credentials
					it issues.
				</p>
			</div>

			<SsoCallbackUrlField callbackUrl={callbackUrl} />

			<div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border-t pt-4">
				<form.Field name="issuer">
					{(field) => (
						<SsoTextField
							description="Your provider's OIDC issuer, used to discover its endpoints."
							field={field}
							label="Issuer URL"
							placeholder="https://login.acme.com"
						/>
					)}
				</form.Field>
				<form.Field name="clientId">
					{(field) => (
						<SsoTextField
							description="Issued by your provider when you create the OIDC app."
							field={field}
							label="Client ID"
						/>
					)}
				</form.Field>
				<form.Field name="clientSecret">
					{(field) => (
						<SsoTextField
							description="Autumn never displays this secret again."
							field={field}
							label="Client secret"
							type="password"
						/>
					)}
				</form.Field>
				<form.Field name="domain">
					{(field) => (
						<SsoTextField
							description="Members with an email at this domain sign in with SSO."
							field={field}
							label="Company domain"
							placeholder="acme.com"
						/>
					)}
				</form.Field>
			</div>

			<div className="flex items-center gap-2">
				<form.Subscribe selector={(state) => state.canSubmit}>
					{(canSubmit) => (
						<Button
							disabled={!canSubmit}
							isLoading={create.isPending}
							type="submit"
							variant="primary"
						>
							Save connection
						</Button>
					)}
				</form.Subscribe>
				<Button
					disabled={create.isPending}
					onClick={onCancel}
					type="button"
					variant="secondary"
				>
					Cancel
				</Button>
			</div>
		</form>
	);
};
