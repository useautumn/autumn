import { format } from "date-fns";

export const formatAdminCreatedAt = (createdAt: Date | string) =>
	format(new Date(createdAt), "dd MMM HH:mm");

export const AdminCreatedAt = ({ createdAt }: { createdAt: Date | string }) => (
	<span className="whitespace-nowrap text-subtle text-xs tabular-nums">
		{formatAdminCreatedAt(createdAt)}
	</span>
);
