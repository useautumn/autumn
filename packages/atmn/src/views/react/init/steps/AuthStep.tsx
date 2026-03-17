import { Box } from "ink";
import {
	type OrgInfo,
	useHeadlessAuth,
} from "../../../../lib/hooks/useHeadlessAuth.js";
import { StatusLine, StepHeader } from "../../components/index.js";

interface AuthStepProps {
	step: number;
	totalSteps: number;
	onComplete: (orgInfo: OrgInfo) => void;
}

export function AuthStep({ step, totalSteps, onComplete }: AuthStepProps) {
	const { authState, orgInfo, error } = useHeadlessAuth({ onComplete });

	return (
		<Box flexDirection="column" marginBottom={1}>
			<StepHeader step={step} totalSteps={totalSteps} title="Authentication" />
			{authState === "checking" && (
				<StatusLine status="loading" message="Checking authentication..." />
			)}
			{authState === "not_authenticated" && (
				<StatusLine status="loading" message="Opening browser for login..." />
			)}
			{authState === "authenticating" && (
				<StatusLine status="loading" message="Waiting for authentication..." />
			)}
			{authState === "authenticated" && orgInfo && (
				<StatusLine
					status="success"
					message={`Logged in as ${orgInfo.name}`}
					detail={orgInfo.slug}
				/>
			)}
			{authState === "error" && (
				<StatusLine status="error" message={error || "Authentication failed"} />
			)}
		</Box>
	);
}
