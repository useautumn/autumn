import { Button, FormLabel, Input } from "@autumn/ui";
import { useId, useState } from "react";
import { toast } from "sonner";
import {
	buildSsoConnectionPayload,
	type SsoFormValues,
	validateSsoForm,
} from "@/lib/sso/ssoForm";
import { getBackendErr } from "@/utils/genUtils";
import { SsoCallbackUrlField } from "./SsoCallbackUrlField";
import type { useSsoActions } from "./useSsoActions";

const emptyValues: SsoFormValues = {
	domain: "",
	issuer: "",
	clientId: "",
	clientSecret: "",
};

export const SsoSetupForm = ({
	onCancel,
	create,
	callbackUrl,
}: {
	onCancel: () => void;
	create: ReturnType<typeof useSsoActions>["create"];
	callbackUrl: string | null;
}) => {
	const domainId = useId();
	const issuerId = useId();
	const clientIdId = useId();
	const clientSecretId = useId();
	const errorId = useId();

	const [values, setValues] = useState<SsoFormValues>(emptyValues);
	const [error, setError] = useState<string | null>(null);

	const setField = (field: keyof SsoFormValues) => (value: string) => {
		setValues((prev) => ({ ...prev, [field]: value }));
		setError(null);
	};

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();

		const validationError = validateSsoForm(values, {
			allowInsecureLocalhost: import.meta.env.DEV,
		});
		if (validationError) {
			setError(validationError);
			return;
		}

		try {
			await create.mutateAsync(buildSsoConnectionPayload(values));
			// The secret is write-only: drop it as soon as the request succeeds.
			setValues(emptyValues);
			toast.success("SSO connection created");
		} catch (err) {
			setError(getBackendErr(err, "Failed to create the SSO connection"));
		}
	};

	return (
		<form
			className="flex flex-col gap-4 rounded-lg border bg-background p-4"
			onSubmit={handleSubmit}
		>
			<div className="flex flex-col gap-1">
				<span className="text-sm font-medium text-foreground">
					Connect your identity provider
				</span>
				<p className="text-sm text-tertiary-foreground">
					Autumn supports OpenID Connect (OIDC). Register the callback URL below
					with your provider, then paste the issuer and client credentials it
					issues back here.
				</p>
			</div>

			<SsoCallbackUrlField callbackUrl={callbackUrl} />

			<div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
				<div className="flex flex-col">
					<FormLabel>
						<label htmlFor={domainId} className="text-muted-foreground">
							Company domain
						</label>
					</FormLabel>
					<Input
						id={domainId}
						value={values.domain}
						placeholder="acme.com"
						autoComplete="off"
						spellCheck={false}
						onChange={(e) => setField("domain")(e.target.value)}
					/>
					<p className="mt-1 text-xs text-tertiary-foreground">
						Members with an email at this domain sign in with SSO.
					</p>
				</div>
				<div className="flex flex-col">
					<FormLabel>
						<label htmlFor={issuerId} className="text-muted-foreground">
							Issuer URL
						</label>
					</FormLabel>
					<Input
						id={issuerId}
						value={values.issuer}
						placeholder="https://login.acme.com"
						autoComplete="off"
						spellCheck={false}
						onChange={(e) => setField("issuer")(e.target.value)}
					/>
					<p className="mt-1 text-xs text-tertiary-foreground">
						Your provider's OIDC issuer, used to discover its endpoints.
					</p>
				</div>
				<div className="flex flex-col">
					<FormLabel>
						<label htmlFor={clientIdId} className="text-muted-foreground">
							Client ID
						</label>
					</FormLabel>
					<Input
						id={clientIdId}
						value={values.clientId}
						autoComplete="off"
						spellCheck={false}
						onChange={(e) => setField("clientId")(e.target.value)}
					/>
				</div>
				<div className="flex flex-col">
					<FormLabel>
						<label htmlFor={clientSecretId} className="text-muted-foreground">
							Client secret
						</label>
					</FormLabel>
					<Input
						id={clientSecretId}
						type="password"
						value={values.clientSecret}
						autoComplete="new-password"
						onChange={(e) => setField("clientSecret")(e.target.value)}
					/>
					<p className="mt-1 text-xs text-tertiary-foreground">
						Autumn never displays this secret again.
					</p>
				</div>
			</div>

			{error && (
				<p id={errorId} role="alert" className="text-sm text-destructive">
					{error}
				</p>
			)}

			<div className="flex items-center gap-2">
				<Button
					type="submit"
					variant="primary"
					isLoading={create.isPending}
					aria-describedby={error ? errorId : undefined}
				>
					Save connection
				</Button>
				<Button
					type="button"
					variant="secondary"
					onClick={onCancel}
					disabled={create.isPending}
				>
					Cancel
				</Button>
			</div>
		</form>
	);
};
