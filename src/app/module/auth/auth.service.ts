/** biome-ignore-all lint/style/useConst: <explanation> */
import bcrypt from "bcryptjs";
import type { JwtPayload, SignOptions } from "jsonwebtoken";
import {
	AuthProvider,
	Role,
	UserStatus,
} from "../../../generated/prisma/enums";
import crypto from "crypto";
import config from "../../config";
import { prisma } from "../../lib/prisma";
import { jwtUtils } from "../../utils/jwt";
import ejs from "ejs";
import type {
	IForgotPasswordPayload,
	IGoogleLoginPayload,
	ILoginUserPayload,
	IRegisterPatientPayload,
	IRequestUser,
	IResetPasswordPayload,
	IVerifyEmailPayload,
} from "./auth.interface";
import { OAuth2Client, type TokenPayload } from "google-auth-library";
import { googleClient } from "../../lib/googleAuth";
import { redisClient } from "../../lib/redis";
import { transporter } from "../../lib/nodemailer";
import path from "path";

const registerPatient = async (payload: IRegisterPatientPayload) => {
	const { name, password, patient: patientData } = payload;

	if (typeof password !== "string" || password.length === 0) {
		throw new Error("Password is required");
	}

	const email = payload.email.trim().toLowerCase();

	const isUserExists = await prisma.user.findUnique({
		where: { email },
	});

	if (isUserExists) {
		throw new Error("User with this email already exists");
	}

	const hashedPassword = await bcrypt.hash(password, config.bcrypt_salt_rounds);

	const expirationTime = 5 * 60;

	const otpKey = `patient-register-otp: ${email}`;
	const otpValue = crypto.randomInt(100000, 1000000).toString();

	await redisClient.set(otpKey, otpValue, {
		expiration: {
			type: "EX",
			value: expirationTime,
		},
	});

	const patientRegisterkey = `patient-register-data:${email}`;
	const redisUserDataPayload = {
		name,
		email,
		password: hashedPassword,
		patient: patientData,
	};

	await redisClient.set(
		patientRegisterkey,
		JSON.stringify(redisUserDataPayload),
		{
			expiration: {
				type: "EX",
				value: expirationTime,
			},
		},
	);

	const tempatePath = path.join(
		process.cwd(),
		"src/app/templates/registration-user-otp.ejs",
	);

	const html = await ejs.renderFile(tempatePath, {
		name,
		email,
		otp: otpValue,
		expirationTime: expirationTime / 60,
	});
	await transporter.sendMail({
		from: config.email_sender,
		to: email,
		subject: "Your Email Verification Code",
		// text: `Your OTP is ${otp}`,
		// html: `<p>Your OTP is <b>${otp}</b></p>`,
		html,
	});
};

const verifyPatientEmail = async (payload: IVerifyEmailPayload) => {
	const otp = payload.otp;
	const email = payload.email.trim().toLowerCase();

	const isUserExists = await prisma.user.findUnique({
		where: { email },
	});

	if (isUserExists?.emailVerified) {
		throw new Error("Email is already verified");
	}

	if (isUserExists?.status === "BLOCKED") {
		throw new Error("User is blocked");
	}

	if (isUserExists?.isDeleted || isUserExists?.status === "DELETED") {
		throw new Error("User is deleted");
	}

	const otpKey = `patient-register-otp: ${email}`;

	const redisOtp = await redisClient.get(otpKey);

	if (!redisOtp) {
		throw new Error("OTP expired");
	}

	if (redisOtp !== otp) {
		throw new Error("Invalid OTP");
	}

	await redisClient.del(otpKey);

	const patientRegisterkey = `patient-register-data:${email}`;

	const redisPatientData = await redisClient.get(patientRegisterkey);

	if (!redisPatientData) {
		throw new Error("patient data not found");
	}

	const patientPayload: IRegisterPatientPayload = JSON.parse(redisPatientData);

	const createdUser = await prisma.user.create({
		data: {
			name: patientPayload.name,
			email: patientPayload.email,
			password: patientPayload.password,
			role: Role.PATIENT,
			status: UserStatus.ACTIVE,
			emailVerified: true,
			patient: {
				create: {
					name: patientPayload.name,
					email: patientPayload.email,
					contactNumber: patientPayload.patient?.contactNumber || "",
				},
			},
		},
		omit: { password: true },
		include: { patient: true },
	});

	await redisClient.del(patientRegisterkey);

	const tempatePath = path.join(
		process.cwd(),
		"src/app/templates/patient-welcome-email.ejs",
	);

	const html = await ejs.renderFile(tempatePath, {
		name: createdUser.name,
		portalUrl: config.frontend_url,
	});
	await transporter.sendMail({
		from: config.email_sender,
		to: email,
		subject: "Welcome to PH Health Care System",
		// text: `Your OTP is ${otp}`,
		// html: `<p>Your OTP is <b>${otp}</b></p>`,
		html,
	});

	const { patient, ...user } = createdUser;
	const jwtPayload = {
		userId: user.id,
		name: user.name,
		email: user.email,
		role: user.role,
	};

	const accessToken = jwtUtils.createToken(
		jwtPayload,
		config.jwt_access_secret,
		config.jwt_access_expires_in as SignOptions,
	);

	const refreshToken = jwtUtils.createToken(
		jwtPayload,
		config.jwt_refresh_secret,
		config.jwt_refresh_expires_in as SignOptions,
	);

	return {
		user,
		patient,
		accessToken,
		refreshToken,
	};
};
const loginUser = async (payload: ILoginUserPayload) => {
	const { password } = payload;

	if (typeof password !== "string" || password.length === 0) {
		throw new Error("Password is required");
	}

	const email = payload.email.trim().toLowerCase();

	const user = await prisma.user.findUnique({
		where: { email },
	});

	if (!user) {
		throw new Error("User not found");
	}

	if (user.status === UserStatus.BLOCKED) {
		throw new Error("User is blocked");
	}

	if (user.isDeleted || user.status === UserStatus.DELETED) {
		throw new Error("User is deleted");
	}

	if (user.password === null && user.googleId !== null) {
		throw new Error("User registered with Google. Please login with Google");
	}

	const isPasswordMatched = await bcrypt.compare(
		password,
		user.password as string,
	);

	if (!isPasswordMatched) {
		throw new Error("Invalid credentials");
	}

	const jwtPayload = {
		userId: user.id,
		name: user.name,
		email: user.email,
		role: user.role,
	};

	const accessToken = jwtUtils.createToken(
		jwtPayload,
		config.jwt_access_secret,
		config.jwt_access_expires_in as SignOptions,
	);

	const refreshToken = jwtUtils.createToken(
		jwtPayload,
		config.jwt_refresh_secret,
		config.jwt_refresh_expires_in as SignOptions,
	);

	return {
		accessToken,
		refreshToken,
	};
};

const getMe = async (user: IRequestUser) => {
	const isUserExists = await prisma.user.findUnique({
		where: {
			id: user.userId,
		},
		include: {
			patient: true,
		},
		omit: {
			password: true,
		},
	});

	if (!isUserExists) {
		throw new Error("User not found");
	}

	return isUserExists;
};

// refresh token function
const refreshToken = async (token: string) => {
	const verifiedRefreshToken = jwtUtils.verifyToken(
		token,
		config.jwt_refresh_secret,
	);

	if (!verifiedRefreshToken.success || !verifiedRefreshToken.data) {
		throw new Error(
			config.node_env === "development"
				? verifiedRefreshToken.error
				: "Invalid refresh token",
		);
	}

	const data = verifiedRefreshToken.data as JwtPayload;

	const user = await prisma.user.findUnique({
		where: { id: data.userId },
	});

	if (!user || user.isDeleted || user.status !== UserStatus.ACTIVE) {
		throw new Error("User is inactive or not found");
	}

	const jwtPayload = {
		userId: user.id,
		name: user.name,
		email: user.email,
		role: user.role,
	};

	const accessToken = jwtUtils.createToken(
		jwtPayload,
		config.jwt_access_secret,
		config.jwt_access_expires_in as SignOptions,
	);

	const refreshToken = jwtUtils.createToken(
		jwtPayload,
		config.jwt_refresh_secret,
		config.jwt_refresh_expires_in as SignOptions,
	);

	return {
		accessToken,
		refreshToken,
	};
};

// Google login function
const googleLogin = async (payload: IGoogleLoginPayload) => {
	let googleIdTokenPayload: TokenPayload | null | undefined = null;

	try {
		const ticket = await googleClient.verifyIdToken({
			idToken: payload.idToken,
			audience: config.google_client_id,
		});

		googleIdTokenPayload = ticket.getPayload();
	} catch (error) {
		console.log("Google ID token verification failed:", error);
		throw new Error("Invalid or Expired Google id Token");
	}

	if (!googleIdTokenPayload) {
		throw new Error("Invalid or Expired Google id Token");
	}

	if (!googleIdTokenPayload.email) {
		throw new Error(" Google email not found ");
	}

	if (!googleIdTokenPayload.name) {
		throw new Error(" Google name not found");
	}

	const ifPatientExistsWithGoogleAuth = await prisma.user.findUnique({
		where: {
			email: googleIdTokenPayload.email,
			role: Role.PATIENT,
			googleId: googleIdTokenPayload.sub,
		},
	});

	let user = ifPatientExistsWithGoogleAuth;
	if (!ifPatientExistsWithGoogleAuth) {
		const ifPatientExistsWithCredentials = await prisma.user.findUnique({
			where: {
				email: googleIdTokenPayload.email,
				role: Role.PATIENT,
				authProvider: AuthProvider.CREDENTIAL,
			},
		});

		if (ifPatientExistsWithCredentials) {
			if (!ifPatientExistsWithCredentials.emailVerified) {
				throw new Error("Email is not verified");
			}
			if (ifPatientExistsWithCredentials.status === UserStatus.BLOCKED) {
				throw new Error("User is Blocked");
			}

			if (
				ifPatientExistsWithCredentials.isDeleted ||
				ifPatientExistsWithCredentials.status === UserStatus.DELETED
			) {
				throw new Error("User is Deleted");
			}

			user = await prisma.user.update({
				where: {
					id: ifPatientExistsWithCredentials.id,
				},

				data: {
					googleId: googleIdTokenPayload.sub,
				},
			});
		} else {
			//
			user = await prisma.user.create({
				data: {
					name: googleIdTokenPayload.name,
					email: googleIdTokenPayload.email,
					role: Role.PATIENT,
					googleId: googleIdTokenPayload.sub,
					authProvider: AuthProvider.GOOGLE,
					emailVerified: true,
					patient: {
						create: {
							name: googleIdTokenPayload.name,
							email: googleIdTokenPayload.email,
						},
					},
				},
			});
		}

		if (!user) {
			throw new Error("User not found");
		}
		if (user.status === UserStatus.BLOCKED) {
			throw new Error("User is Blocked");
		}

		if (user.isDeleted || user.status === UserStatus.DELETED) {
			throw new Error("User is Deleted");
		}
	}

	if (!user) {
		throw new Error("User not found");
	}

	const tempatePath = path.join(
		process.cwd(),
		"src/app/templates/patient-welcome-email.ejs",
	);

	const html = await ejs.renderFile(tempatePath, {
		name: user.name,
		portalUrl: config.frontend_url,
	});
	await transporter.sendMail({
		from: config.email_sender,
		to: user.email,
		subject: "Welcome to PH Health Care System",
		// text: `Your OTP is ${otp}`,
		// html: `<p>Your OTP is <b>${otp}</b></p>`,
		html,
	});

	const jwtPayload = {
		userId: user.id,
		name: user.name,
		email: user.email,
		role: user.role,
	};

	const accessToken = jwtUtils.createToken(
		jwtPayload,
		config.jwt_access_secret,
		config.jwt_access_expires_in as SignOptions,
	);

	const refreshToken = jwtUtils.createToken(
		jwtPayload,
		config.jwt_refresh_secret,
		config.jwt_refresh_expires_in as SignOptions,
	);

	return {
		accessToken,
		refreshToken,
	};
};

// forgot password
const forgotPassword = async (payload: IForgotPasswordPayload) => {
	const { email } = payload;

	const isUserExists = await prisma.user.findUnique({
		where: {
			email,
		},
	});

	if (!isUserExists) {
		throw new Error("User not found");
	}

	if (isUserExists.status === UserStatus.BLOCKED) {
		throw new Error("User is Blocked");
	}

	if (!isUserExists.emailVerified) {
		throw new Error("Email is not verified");
	}

	if (isUserExists.isDeleted || isUserExists.status === UserStatus.DELETED) {
		throw new Error("User is Deleted");
	}

	// 	if(isUserExists.googleId || isUserExists.authProvider === "GOOGLE"){
	// 		throw new Error( "User registered with Google. Please login with Google" );
	// 	}

	if (isUserExists.googleId && isUserExists.authProvider === "GOOGLE") {
		throw new Error("User registered with Google. Please login with Google");
	}

	const otp = crypto.randomInt(100000, 1000000).toString();

	const key = `forgot-password-otp:${isUserExists.email}`;

	const expirationTime = 5 * 60;
	await redisClient.set(key, otp, {
		expiration: {
			type: "EX",
			value: expirationTime,
		},
	});

	const tempatePath = path.join(
		process.cwd(),
		"src/app/templates/forgot-password.ejs",
	);

	const html = await ejs.renderFile(tempatePath, {
		name: isUserExists.name,
		otp,
		expirationTime: expirationTime / 60,
	});
	await transporter.sendMail({
		from: config.email_sender,
		to: isUserExists.email,
		subject: "Forgot password OTP",
		// text: `Your OTP is ${otp}`,
		// html: `<p>Your OTP is <b>${otp}</b></p>`,
		html,
	});
};

// reset password service
const resetPassword = async (payload: IResetPasswordPayload) => {
	const { email, otp, newPassword } = payload;

	const isUserExists = await prisma.user.findUnique({
		where: {
			email,
		},
	});

	if (!isUserExists) {
		throw new Error("User not found");
	}

	if (isUserExists.status === UserStatus.BLOCKED) {
		throw new Error("User is Blocked");
	}

	if (!isUserExists.emailVerified) {
		throw new Error("Email is not verified");
	}

	if (isUserExists.isDeleted || isUserExists.status === UserStatus.DELETED) {
		throw new Error("User is Deleted");
	}

	// 	if(isUserExists.googleId || isUserExists.authProvider === "GOOGLE"){
	// 		throw new Error( "User registered with Google. Please login with Google" );
	// 	}

	if (isUserExists.googleId && isUserExists.authProvider === "GOOGLE") {
		throw new Error("User registered with Google. Please login with Google");
	}

	const key = `forgot-password-otp:${isUserExists.email}`;

	const redisOtp = await redisClient.get(key);

	if (!redisOtp) {
		throw new Error("OTP expired");
	}

	if (redisOtp !== otp) {
		throw new Error("Invalid OTP");
	}

	const hashedPassword = await bcrypt.hash(
		newPassword,
		Number(config.bcrypt_salt_rounds),
	);

	const updatedUser = await prisma.user.update({
		where: {
			email: isUserExists.email,
		},
		data: {
			password: hashedPassword,
		},
	});

	await redisClient.del([key]);
	const tempatePath = path.join(
		process.cwd(),
		"src/app/templates/reset-password-success.ejs",
	);

	const html = await ejs.renderFile(tempatePath, {
		user: {
			name: isUserExists.name,
		},
		change_date: new Date().toLocaleString(),
		login_url: config.frontend_url ?? "#",
		support_url: config.frontend_url ?? "#",
	});

	await transporter.sendMail({
		from: config.email_sender,
		to: isUserExists.email,
		subject: "Password changed successfully",
		// text: `Your OTP is ${otp}`,
		// html: `<p>Your OTP is <b>${otp}</b></p>`,
		html,
	});
};

export const AuthService = {
	registerPatient,
	verifyPatientEmail,
	loginUser,
	getMe,
	refreshToken,
	googleLogin,
	forgotPassword,
	resetPassword,
};
