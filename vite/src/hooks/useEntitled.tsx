import axios from "axios";
import { useEffect, useState } from "react";
export const useEntitled = ({
	customerId,
	featureId,
}: {
	customerId: string;
	featureId: string;
}) => {
	const url = `${process.env.NEXT_PUBLIC_BACKEND_URL}/v1/entitled`;

	const [entitled, setEntitled] = useState<any>(null);
	const [loading, setLoading] = useState<boolean>(true);
	const [error, setError] = useState<any>(null);

	useEffect(() => {
		const fetchEntitled = async () => {
			if (!process.env.NEXT_PUBLIC_AUTUMN_PUBLISHABLE_KEY) {
				setError("NEXT_PUBLIC_AUTUMN_PUBLISHABLE_KEY is not set");
				setLoading(false);
				return;
			}

			try {
				const res = await axios.post(
					url,
					{
						customer_id: customerId,
						feature_id: featureId,
					},
					{
						headers: {
							"x-publishable-key": process.env.NEXT_PUBLIC_PUBLISHABLE_KEY,
						},
					},
				);
				setEntitled(res.data.allowed);
			} catch (error: any) {
				setError(error.response.data);
			} finally {
				setLoading(false);
			}
		};

		fetchEntitled();
	}, [url, customerId, featureId]);

	return { entitled, loading, error };
};
