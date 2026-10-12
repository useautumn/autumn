import { ATOM_REPLICAS } from "@autumn/shared";

/** What a size costs and creates, under the size table. */
export const AtomSizeFootnote = () => (
	<div className="flex flex-col gap-1 text-xs text-tertiary-foreground">
		<span>
			Runs {ATOM_REPLICAS} replicas for high availability. Prices are estimates
			at AWS list price (us-east-1), billed by AWS to your account.
		</span>
		<span>
			Created in your AWS account: {ATOM_REPLICAS} × EC2 instance ·{" "}
			{ATOM_REPLICAS} × EBS volume (100 GB gp3) · 1 × SQS queue
		</span>
	</div>
);
