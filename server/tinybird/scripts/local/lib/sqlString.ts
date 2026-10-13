export const sqlString = (value: string) =>
	`'${value.replaceAll("\\", "\\\\").replaceAll("'", "\\'")}'`;

export const orgEnvWhere = ({ orgId, env }: { orgId: string; env: string }) =>
	`org_id = ${sqlString(orgId)} AND env = ${sqlString(env)}`;
