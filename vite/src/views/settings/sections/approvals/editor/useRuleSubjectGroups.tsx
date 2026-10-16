import type { Membership, RuleSubject } from "@autumn/shared";
import { useRolesQuery } from "@/hooks/queries/useRolesQuery";
import { useMemberships } from "@/views/main-sidebar/org-dropdown/hooks/useMemberships";
import { SUBJECT_ICONS } from "../subjectIcons";
import type { ChipOptionGroup } from "./ChipMultiSelect";

export const subjectKey = (subject: RuleSubject) => {
	if (subject.type === "role") return `role:${subject.role_id}`;
	if (subject.type === "user") return `user:${subject.user_id}`;
	return "everyone";
};

const keyToSubject = (key: string): RuleSubject => {
	const [type, id] = key.split(/:(.*)/s);
	if (type === "role") return { type: "role", role_id: id };
	if (type === "user") return { type: "user", user_id: id };
	return { type: "everyone" };
};

export const toggleSubject = ({
	subjects,
	key,
}: {
	subjects: RuleSubject[];
	key: string;
}) =>
	subjects.some((subject) => subjectKey(subject) === key)
		? subjects.filter((subject) => subjectKey(subject) !== key)
		: [...subjects, keyToSubject(key)];

const option = (subject: RuleSubject, label: string) => {
	const Icon = SUBJECT_ICONS[subject.type];
	return { value: subjectKey(subject), label, icon: <Icon /> };
};

/** Everyone, the org's roles and its members, for the Who picker. */
export const useRuleSubjectGroups = (): ChipOptionGroup[] => {
	const { roles } = useRolesQuery();
	const { memberships } = useMemberships();

	return [
		{ label: "Everyone", options: [option({ type: "everyone" }, "Everyone")] },
		{
			label: "Roles",
			options: roles.map(({ id, name }) =>
				option({ type: "role", role_id: id }, name),
			),
		},
		{
			label: "Members",
			options: memberships.map(({ user }: Membership) =>
				option({ type: "user", user_id: user.id }, user.name || user.email),
			),
		},
	];
};
