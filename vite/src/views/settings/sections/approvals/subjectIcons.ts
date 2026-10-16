import { GlobeIcon, UserIcon, UsersIcon } from "@phosphor-icons/react";
import type { RuleSubject } from "./approvalsStub";

export const SUBJECT_ICONS: Record<RuleSubject["type"], typeof UserIcon> = {
	everyone: GlobeIcon,
	role: UsersIcon,
	user: UserIcon,
};
