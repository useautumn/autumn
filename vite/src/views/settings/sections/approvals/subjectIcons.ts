import type { RuleSubject } from "@autumn/shared";
import { GlobeIcon, UserIcon, UsersIcon } from "@phosphor-icons/react";

export const SUBJECT_ICONS: Record<RuleSubject["type"], typeof UserIcon> = {
	everyone: GlobeIcon,
	role: UsersIcon,
	user: UserIcon,
};
