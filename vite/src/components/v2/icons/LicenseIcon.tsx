import { type IconProps, TicketIcon } from "@phosphor-icons/react";

/** Canonical icon for anything license-related. Use everywhere licenses are
 * referenced so the visual language stays consistent. */
export const LicenseIcon = (props: IconProps) => (
	<TicketIcon weight="fill" {...props} />
);
