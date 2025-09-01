import { useSession } from "@clerk/clerk-react";
import axios from "axios";
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router";
import ErrorScreen from "./general/ErrorScreen";
import LoadingScreen from "./general/LoadingScreen";
export default function CliAuth() {
	const [searchParams] = useSearchParams();
	const { session } = useSession();

	const [savedToken, setSavedToken] = useState<boolean>(false);
	const [error, setError] = useState<boolean>(false);

	const handleCallback = async () => {
		const _code = searchParams.get("code");
		const redirectUrl = searchParams.get("redirect");

		if (!redirectUrl) {
			return;
		}

		const token = await session?.getToken({
			template: "cli_template",
		});

		try {
			await axios.get(redirectUrl, {
				params: {
					token: token,
				},
			});
			setSavedToken(true);
		} catch (_error) {
			setError(true);
		}
	};

	useEffect(() => {
		if (!session) {
			return;
		}

		handleCallback();
	}, [session, handleCallback]);

	if (savedToken) {
		return (
			<div className="h-full w-full flex justify-center items-center">
				<div className="">✅ Successfully authenticated CLI</div>
			</div>
		);
	}

	if (error) {
		return <ErrorScreen>Something went wrong, please try again</ErrorScreen>;
	}

	return <LoadingScreen />;
}
