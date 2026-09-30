import config from "../config";
import { redisClient } from "./redis";

export const getBkashIdToken = async () => {
	try {
		const idTokenKey = "bkash:idToken";
		const RefreshTokenKey = "bkash:refreshToken";

		let bkashIdToken = await redisClient.get(idTokenKey);
		const bkashIdTokenTTl = await redisClient.ttl(idTokenKey);
		const bkashRefreshToken = await redisClient.get(RefreshTokenKey);

		const bkashRefreshTokenTtl = await redisClient.ttl(RefreshTokenKey);

		console.log(
			bkashIdToken,
			bkashIdTokenTTl,
			bkashRefreshToken,
			bkashRefreshTokenTtl,
		);

		// bkash id token remaining time is less than 10 minutes and refresh token is available
		if (
			(bkashIdTokenTTl <= 600 || !bkashIdToken) &&
			bkashRefreshToken &&
			bkashRefreshTokenTtl >= 600
		) {
			const refreshTokenResponse = await fetch(
				`${config.bkash_base_url}/tokenized-checkout/auth/refresh-token`,
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
						refresh_token: bkashRefreshToken,
					}),
				},
			);

			const bkashRefreshTokenResult = await refreshTokenResponse.json();

			bkashIdToken = bkashRefreshTokenResult.id_token as string;

			await redisClient.set(idTokenKey, bkashIdToken, {
				expiration: {
					type: "EX",
					value: 60 * 60, // 1 hour
				},
			});

			return bkashIdToken;
		}

		// bkash id token remaining time is more than 10 minutes
		if (bkashIdTokenTTl >= 600) {
			return bkashIdToken;
		}

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

		// store id token and refresh token in redis
		await redisClient.set(idTokenKey, result.id_token, {
			expiration: {
				type: "EX",
				value: 3600,
			},
		});

		// store id token and refresh token in redis
		await redisClient.set(RefreshTokenKey, result.refresh_token, {
			expiration: {
				type: "EX",
				value: 60 * 60 * 24 * 28,
			},
		});

		bkashIdToken = result.id_token;

		return bkashIdToken;
	} catch (error: any) {
		throw new Error("Failed to get bkash id token");
	}
};
