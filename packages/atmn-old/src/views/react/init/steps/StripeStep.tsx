import { Box, Text } from "ink";
import open from "open";
import { useCallback, useEffect, useRef, useState } from "react";
import { FRONTEND_URL } from "../../../../constants.js";
import { fetchOrganization } from "../../../../lib/api/endpoints/organization.js";
import { readFromEnv } from "../../../../lib/utils.js";
import { StatusLine, StepHeader } from "../../components/index.js";

type StripeState =
	| "pending"
	| "checking"
	| "not_connected"
	| "connecting"
	| "connected"
	| "error";

interface StripeStepProps {
	step: number;
	totalSteps: number;
	onComplete: () => void;
}

export function StripeStep({ step, totalSteps, onComplete }: StripeStepProps) {
	const [stripeState, setStripeState] = useState<StripeState>("pending");
	const [stripeError, setStripeError] = useState<string | null>(null);
	const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

	const connectStripe = useCallback(async () => {
		setStripeState("connecting");

		const stripeConnectUrl = `${FRONTEND_URL}/dev?tab=stripe`;
		await open(stripeConnectUrl);

		const maxAttempts = 60;
		let attempts = 0;

		const pollInterval = setInterval(async () => {
			attempts++;

			try {
				const secretKey = readFromEnv({ bypass: true });
				if (!secretKey) {
					return;
				}

				const orgDetails = await fetchOrganization({ secretKey });

				if (
					orgDetails.stripe_connection &&
					orgDetails.stripe_connection !== "none"
				) {
					if (pollIntervalRef.current) {
						clearInterval(pollIntervalRef.current);
						pollIntervalRef.current = null;
					}
					setStripeState("connected");
					onComplete();
				} else if (attempts >= maxAttempts) {
					if (pollIntervalRef.current) {
						clearInterval(pollIntervalRef.current);
						pollIntervalRef.current = null;
					}
					setStripeError("Timed out waiting for Stripe connection");
					setStripeState("error");
				}
			} catch {
			}
		}, 5000);

		pollIntervalRef.current = pollInterval;
	}, [onComplete]);

	const checkStripe = useCallback(async () => {
		setStripeState("checking");

		try {
			const secretKey = readFromEnv({ bypass: true });
			if (!secretKey) {
				setStripeError("No API key found. Please run 'atmn login' first.");
				setStripeState("error");
				return;
			}

			const orgDetails = await fetchOrganization({ secretKey });

			if (
				orgDetails.stripe_connection &&
				orgDetails.stripe_connection !== "none"
			) {
				setStripeState("connected");
				onComplete();
			} else {
				setStripeState("not_connected");
				await connectStripe();
			}
		} catch (error) {
			setStripeError(
				error instanceof Error
					? error.message
					: "Failed to check Stripe status",
			);
			setStripeState("error");
		}
	}, [connectStripe, onComplete]);

	useEffect(() => {
		if (stripeState === "pending") {
			checkStripe();
		}
	}, [checkStripe, stripeState]);

	useEffect(() => {
		return () => {
			if (pollIntervalRef.current) {
				clearInterval(pollIntervalRef.current);
				pollIntervalRef.current = null;
			}
		};
	}, []);

	return (
		<Box flexDirection="column" marginBottom={1}>
			<StepHeader
				step={step}
				totalSteps={totalSteps}
				title="Stripe Connection"
			/>
			{stripeState === "checking" && (
				<StatusLine status="loading" message="Checking Stripe connection..." />
			)}
			{stripeState === "not_connected" && (
				<StatusLine status="loading" message="Opening Stripe Connect..." />
			)}
			{stripeState === "connecting" && (
				<Box flexDirection="column">
					<StatusLine
						status="loading"
						message="Waiting for Stripe connection..."
					/>
					<Text dimColor>
						{" "}
						Complete the setup in your browser, then return here.
					</Text>
				</Box>
			)}

			{stripeState === "connected" && (
				<StatusLine status="success" message="Stripe connected" />
			)}

			{stripeState === "error" && (
				<StatusLine
					status="error"
					message={stripeError || "Stripe connection failed"}
				/>
			)}
		</Box>
	);
}
