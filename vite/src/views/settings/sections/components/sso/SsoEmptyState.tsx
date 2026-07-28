import { Button } from "@autumn/ui";
import { LockKeyIcon } from "@phosphor-icons/react";
import { SsoCallbackUrlField } from "./SsoCallbackUrlField";

export const SsoEmptyState = ({
	onStart,
	callbackUrl,
}: {
	onStart: () => void;
	callbackUrl: string | null;
}) => (
	<div className="flex flex-col items-start gap-4 rounded-lg border border-dashed bg-background p-6">
		<div className="flex items-center gap-2">
			<LockKeyIcon
				size={16}
				weight="fill"
				className="text-subtle shrink-0"
				aria-hidden="true"
			/>
			<span className="text-sm font-medium text-foreground">
				Single sign-on is not set up
			</span>
		</div>
		<p className="max-w-xl text-sm text-tertiary-foreground">
			Connect your identity provider so your team signs in to Autumn with your
			company credentials instead of an email code. Once SSO is active, everyone
			with an email at your verified domain signs in through your provider, so
			access follows the accounts you already manage.
		</p>
		<p className="max-w-xl text-sm text-tertiary-foreground">
			Setup takes three steps: register the callback URL below with your
			provider and add the OIDC details it issues, verify your domain with a DNS
			record, then run one test sign-in to turn it on.
		</p>
		<div className="w-full max-w-xl">
			<SsoCallbackUrlField callbackUrl={callbackUrl} />
		</div>
		<Button variant="primary" onClick={onStart}>
			Set up SSO
		</Button>
	</div>
);
