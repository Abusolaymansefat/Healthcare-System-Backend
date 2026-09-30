import config from "../config";
import { redisClient } from "./redis";

export const getBkashIdToken = async () => {
	try {
		const idTokenKey = "bkash:idToken";
		const RefreshTokenKey = "bkash:refreshToken";
		const response = await fetch(
			`${config.bkash_base_url}/tokenized/checkout/token/grant`,
			{
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					// 'Authorization': `Basic ${config.bkash_app_key}:${config.bkash_app_secret}`
					Accept: "application/json",
					username: config.bkash_username,
					password: config.bkash_password,
				},
				body: JSON.stringify({
					app_key: config.bkash_app_key,
					app_secret: config.bkash_app_secret,
				}),
			},
		);

		if (!response.ok) {
			throw new Error("Failed to get bkash id token");
		}
		const result = await response.json();

		await redisClient.set(idTokenKey, result.id_token, {
			expiration: {
				type: "EX",
				value: 3600,
			},
		});
		await redisClient.set(RefreshTokenKey, result.refresh_token, {
			expiration: {
				type: "EX",
				value: 3600,
			},
		});

		return result;
	} catch (error: any) {
		throw new Error("Failed to get bkash id token");
	}
};
