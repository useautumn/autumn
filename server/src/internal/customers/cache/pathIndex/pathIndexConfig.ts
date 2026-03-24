/** Build the Redis Hash key for the FullCustomer path index */
export const buildPathIndexKey = ({
	orgId,
	env,
	customerId,
}: {
	orgId: string;
	env: string;
	customerId: string;
}) => {
	return `{${orgId}}:${env}:fullcustomer:pathidx:${customerId}`;
};
