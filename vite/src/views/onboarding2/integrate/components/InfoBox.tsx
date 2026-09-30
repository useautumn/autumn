import { Alert, AlertDescription } from "@autumn/ui";
import {
	CheckCircleIcon,
	InfoIcon,
	WarningCircleIcon,
} from "@phosphor-icons/react";

type InfoBoxVariant = "info" | "warning" | "error" | "note" | "success";

const INFO_BOX_STYLES = {
	note: { alertVariant: "note", Icon: InfoIcon },
	info: { alertVariant: "default", Icon: InfoIcon },
	warning: { alertVariant: "warning", Icon: WarningCircleIcon },
	error: { alertVariant: "destructive", Icon: WarningCircleIcon },
	success: { alertVariant: "success", Icon: CheckCircleIcon },
} as const;

export const InfoBox = ({
	classNames,
	children,
	action,
	variant = "note",
}: {
	classNames?: {
		infoIcon?: string;
		infoBox?: string;
	};
	children: React.ReactNode;
	action?: React.ReactNode;
	variant?: InfoBoxVariant;
}) => {
	const { alertVariant, Icon } = INFO_BOX_STYLES[variant];

	return (
		<Alert variant={alertVariant} className={classNames?.infoBox}>
			<Icon weight="fill" className={classNames?.infoIcon} />
			<AlertDescription className="flex min-w-0 flex-col gap-2">
				<span className="whitespace-pre-wrap">{children}</span>
				{action && <div className="self-start">{action}</div>}
			</AlertDescription>
		</Alert>
	);
};
