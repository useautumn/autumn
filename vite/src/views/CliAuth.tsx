import { useEffect, useState } from "react";
import { useSearchParams } from "react-router";
import axios from "axios";
import { useSession } from "@clerk/clerk-react";
import LoadingScreen from "./general/LoadingScreen";
import ErrorScreen from "./general/ErrorScreen";
export default function CliAuth() {
	let [searchParams] = useSearchParams();
	let { session } = useSession();

	let [savedToken, setSavedToken] = useState<boolean>(false);
	let [error, setError] = useState<boolean>(false);

	const handleCallback = async () => {
		let code = searchParams.get("code");
		let redirectUrl = searchParams.get("redirect");

		if (!redirectUrl) {
			return;
		}

		let token = await session?.getToken({
			template: "cli_template",
		});

		try {
			await axios.get(redirectUrl, {
				params: {
					token: token,
				},
			});
			setSavedToken(true);
		} catch (error) {
			setError(true);
		}
	};

	useEffect(() => {
		if (!session) {
			return;
		}

		handleCallback();
	}, [searchParams, session]);

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
