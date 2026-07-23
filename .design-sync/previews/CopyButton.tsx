import { CopyButton } from "@autumn/ui";

export const Default = () => (
	<div className="flex items-center gap-2">
		<CopyButton text="cus_2x8Kp4RvLm9Qz" />
	</div>
);

export const Identifiers = () => (
	<div className="flex flex-col items-start gap-2">
		<CopyButton text="cus_2x8Kp4RvLm9Qz" />
		<CopyButton text="sub_1QxLm2RvKp8TdA" />
		<CopyButton text="in_1PwKj8TzQdR4Nx" />
	</div>
);

export const WithCustomLabel = () => (
	<div className="flex flex-col items-start gap-2">
		<CopyButton text="am_sk_live_7Kp4RvLm9QzX2n">
			Copy secret key
		</CopyButton>
		<CopyButton text="https://api.useautumn.com/v1/customers">
			Copy endpoint URL
		</CopyButton>
	</div>
);

export const Orientation = () => (
	<div className="flex flex-col items-start gap-2">
		<CopyButton iconOrientation="left" text="cus_2x8Kp4RvLm9Qz" />
		<CopyButton iconOrientation="right" text="cus_2x8Kp4RvLm9Qz" />
	</div>
);
