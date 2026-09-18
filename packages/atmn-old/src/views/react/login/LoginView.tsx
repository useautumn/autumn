import { Box, Text } from "ink";
import SelectInput from "ink-select-input";
import { useLogin } from "../../../lib/hooks/useLogin.js";
import { Card, CardWidthProvider, LoadingText } from "../components/index.js";

// Auth URL for fallback display
const _AUTH_URL = "https://app.useautumn.com/cli-auth";

interface LoginViewProps {
	onComplete?: () => void;
}

/**
 * Beautiful login UI with progressive rendering
 */
export function LoginView({ onComplete }: LoginViewProps) {
	const login = useLogin({ onComplete });
	const _duration = ((Date.now() - login.startTime) / 1000).toFixed(1);

	// Re-auth confirmation options
	const reauthOptions = [
		{ label: "Yes, re-authenticate", value: "yes" },
		{ label: "No, keep current keys", value: "no" },
	];

	const handleReauthSelect = (item: { value: string }) => {
		if (item.value === "yes") {
			login.confirmReauth();
		} else {
			login.cancelReauth();
		}
	};

	return (
		<CardWidthProvider>
			<Box flexDirection="column" marginBottom={1}>
				{/* Header */}
				<Card title="🍂 Logging into Autumn" />

				{/* Checking phase */}
				{login.phase === "checking" && (
					<Card title="🔍 Checking">
						<LoadingText text="Checking existing authentication..." />
					</Card>
				)}

				{/* Re-auth confirmation */}
				{login.phase === "confirm_reauth" && (
					<Card title="🔑 Already Authenticated">
						<Text>You already have API keys configured.</Text>
						<Text color="gray">Would you like to re-authenticate?</Text>
						<Box marginTop={1}>
							<SelectInput
								items={reauthOptions}
								onSelect={handleReauthSelect}
							/>
						</Box>
					</Card>
				)}

				{/* Browser phases */}
				{(login.phase === "opening_browser" ||
					login.phase === "waiting_auth") && (
					<Card title="🌐 Browser">
						<LoadingText
							text={
								login.phase === "opening_browser"
									? "Opening browser..."
									: "Waiting for authentication..."
							}
						/>
						<Box marginTop={1}>
							<Text color="gray">
								Complete sign-in in your browser, then select an org.
							</Text>
						</Box>
					</Card>
				)}

				{/* Creating keys */}
				{login.phase === "creating_keys" && (
					<Card title="🔑 API Keys">
						<LoadingText text="Creating API keys..." />
					</Card>
				)}

				{/* Saving keys */}
				{login.phase === "saving_keys" && (
					<Card title="🔑 API Keys">
						<LoadingText text="Saving keys to .env..." />
					</Card>
				)}

				{/* Complete */}
				{login.phase === "complete" && login.orgInfo && (
					<>
						<Card title="🏢 Organization">
							<Text>
								<Text color="gray">Name: </Text>
								<Text>{login.orgInfo.name}</Text>
							</Text>
							<Text>
								<Text color="gray">Slug: </Text>
								<Text>{login.orgInfo.slug}</Text>
							</Text>
						</Card>
						<Card title="🔑 API Keys">
							<Text>
								<Text color="green">✓</Text> AUTUMN_SECRET_KEY{" "}
								<Text color="gray">saved to .env</Text>
							</Text>
							<Text>
								<Text color="green">✓</Text> AUTUMN_PROD_SECRET_KEY{" "}
								<Text color="gray">saved to .env</Text>
							</Text>
						</Card>
						<Box marginTop={1}>
							<Text color="green">
								✨ Ready! Run `atmn push` to sync your config.
							</Text>
						</Box>
					</>
				)}

				{/* Complete but cancelled reauth */}
				{login.phase === "complete" && !login.orgInfo && (
					<Box marginTop={1}>
						<Text color="gray">Keeping existing authentication.</Text>
					</Box>
				)}

				{/* Error */}
				{login.phase === "error" && (
					<Card title="✗ Authentication Failed">
						<Text color="red">
							{login.error || "An unknown error occurred."}
						</Text>
						<Box marginTop={1}>
							<Text color="gray">Please try again with `atmn login`.</Text>
						</Box>
					</Card>
				)}
			</Box>
		</CardWidthProvider>
	);
}
