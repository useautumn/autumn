import type { Membership, RuleSubject } from "@autumn/shared";
import { useQuery } from "@tanstack/react-query";
import { useQueryKeyFactory } from "@/hooks/common/useQueryKeyFactory";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { useMemberships } from "@/views/main-sidebar/org-dropdown/hooks/useMemberships";
import { SUBJECT_ICONS } from "../subjectIcons";
import type { ChipOption, ChipOptionGroup } from "./ChipMultiSelect";

// Swap for `ApiRole` from `@autumn/shared/api/roles/apiRole` and U2's `useRolesQuery` once D4 (#4992) and U2 (#4988) merge.
type RuleRole = { name: string; label: string };

export const subjectKey = (subject: RuleSubject) => {
	if (subject.type === "everyone") return "everyone";
	if (subject.type === "role") return `role:${subject.role}`;
	return `user:${subject.user_id}`;
};

const keyToSubject = (key: string): RuleSubject => {
	const [type, id] = key.split(/:(.*)/s);
	if (type === "role") return { type: "role", role: id };
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

const option = ({
	subject,
	label,
}: {
	subject: RuleSubject;
	label: string;
}): ChipOption => {
	const Icon = SUBJECT_ICONS[subject.type];
	return { value: subjectKey(subject), label, icon: <Icon /> };
};

const useRuleRoles = () => {
	const axios = useAxiosInstance();
	const buildKey = useQueryKeyFactory();
	const { data } = useQuery({
		queryKey: buildKey(["roles"]),
		queryFn: async () =>
			(await axios.get<{ list: RuleRole[] }>("/roles")).data.list,
	});
	return data ?? [];
};

/** Everyone, the org's roles and its members, for the Who picker. */
export const useRuleSubjectGroups = (): ChipOptionGroup[] => {
	const roles = useRuleRoles();
	const { memberships } = useMemberships();

	return [
		{
			label: "Everyone",
			options: [option({ subject: { type: "everyone" }, label: "Everyone" })],
		},
		{
			label: "Roles",
			options: roles.map((role) =>
				option({
					subject: { type: "role", role: role.name },
					label: role.label,
				}),
			),
		},
		{
			label: "Members",
			options: memberships.map(({ user }: Membership) =>
				option({
					subject: { type: "user", user_id: user.id },
					label: user.name || user.email,
				}),
			),
		},
	];
};
