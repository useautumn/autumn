import { Badge } from "@autumn/ui";
import { CheckCircleIcon } from "@phosphor-icons/react";
import type { SsoConnection } from "@/lib/sso/ssoTypes";
import { SsoConnectionSummary } from "./SsoConnectionSummary";

export const SsoActiveCard = ({
	connection,
	callbackUrl,
	onDelete,
}: {
	connection: SsoConnection;
	callbackUrl: string | null;
	onDelete: React.ReactNode;
}) => (
	<div className="flex flex-col gap-3 rounded-lg border bg-card p-4">
		<div className="flex flex-col gap-1">
			<div className="flex items-center gap-2">
				<CheckCircleIcon
					size={16}
					weight="fill"
					className="text-green-500 shrink-0"
					aria-hidden="true"
				/>
				<span className="text-sm font-medium text-foreground">
					{connection.domain}
				</span>
				<Badge variant="green">Active</Badge>
			</div>
			<p className="text-sm text-tertiary-foreground">
				Everyone with an @{connection.domain} email signs in to Autumn through
				your identity provider.
			</p>
		</div>

		<SsoConnectionSummary connection={connection} callbackUrl={callbackUrl} />

		<div className="flex flex-wrap items-center gap-2">{onDelete}</div>
	</div>
);
