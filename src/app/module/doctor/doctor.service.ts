import { UploadApiResponse } from "cloudinary";
import { prisma } from "../../lib/prisma";
import { cloudinary } from "../../lib/cloudinary";
import bcrypt from "bcryptjs";
import config from "../../config";
import {
	DoctorVerificationStatus,
	Role,
} from "../../../generated/prisma/enums";
import crypto from "crypto";
import { redisClient } from "../../lib/redis";
import path from "path";
import { transporter } from "../../lib/nodemailer";
import ejs from "ejs";
import {
	IApplyDoctorPayload,
	IApproveDoctorPayload,
	IVerifyDoctorEmailPayload,
} from "./doctor.interface";
import { RequestUser } from "../../middleware/checkAuth";

const applyDoctor = async (
	payload: IApplyDoctorPayload,
	resume: Express.Multer.File | null,
	additionalFiles: Express.Multer.File[],
) => {
	const isUserExists = await prisma.user.findUnique({
		where: {
			email: payload.user.email,
		},
	});

	if (isUserExists) {
		throw new Error("A user with this email already exists");
	}

	const resumeUploadResult = await new Promise<UploadApiResponse>(
		(resolve, reject) => {
			cloudinary.uploader
				.upload_stream(
					{
						resource_type: "auto",
					},

					async (error, result) => {
						if (error) {
							return reject(error);
						}

						if (!result) {
							return reject(new Error("No result returned from Cloudinary"));
						}

						resolve(result);
					},
				)
				.end(resume?.buffer);
		},
	);

	const additionalFilesUploadResult = await Promise.all(
		additionalFiles.map((file) => {
			return new Promise<UploadApiResponse>((resolve, reject) => {
				cloudinary.uploader
					.upload_stream({ resource_type: "auto" }, (error, result) => {
						if (error) return reject(error);
						if (!result)
							return reject(new Error("No result returned from Cloudinary"));
						resolve(result);
					})
					.end(file.buffer);
			});
		}),
	);

	const randomDoctorPassword = Math.random().toString(36).slice(-8);

	const hashedPassword = await bcrypt.hash(
		randomDoctorPassword,
		Number(config.bcrypt_salt_rounds),
	);
	const doctorApplication = await prisma.user.create({
		data: {
			...payload.user,
			password: hashedPassword,
			role: Role.DOCTOR,
			doctor: {
				create: {
					name: payload.user.name,
					email: payload.user.email,
					address: payload.doctor.address,
					specialization: payload.doctor.specialization,
					licenseNumber: payload.doctor.licenseNumber,
					qualifications: payload.doctor.qualifications,
					experience: Number(payload.doctor.experience), // Make sure it parses as an Int
					bio: payload.doctor.bio,
					consultationFee: payload.doctor.consultationFee,
					contactNumber: payload.doctor.contactNumber,
					resume: resumeUploadResult?.secure_url || null, // Matches 'resume' string in your schema
					resumePublicId: resumeUploadResult?.public_id || null,
					additionalFiles: additionalFilesUploadResult.map((file) => ({
						url: file.secure_url,
						publicId: file.public_id,
					})),
				},
			},
		},
		include: {
			doctor: true,
		},
	});

	const expirationSecond = 60 * 60; // 1 hour

	const otpKey = `doctor-application-otp:${payload.user.email}`;
	const otpValue = crypto.randomInt(100000, 1000000).toString();

	await redisClient.set(otpKey, otpValue, {
		expiration: {
			type: "EX",
			value: expirationSecond,
		},
	});

	const tempatePath = path.join(
		process.cwd(),
		"src/app/templates/registration-user-otp.ejs",
	);

	const templateData = {
		name: payload.user.name,
		email: payload.user.email,
		password: randomDoctorPassword,
		otp: otpValue,
		// Add any other template data you need
		expirationMinutes: expirationSecond / 60,
	};

	const html = await ejs.renderFile(tempatePath, templateData);

	await transporter.sendMail({
		from: config.email_sender,
		to: payload.user.email,
		subject: "Doctor Application Email Verification",
		html,
	});

	return doctorApplication;
};

const verifyDoctorEmail = async (payload: IVerifyDoctorEmailPayload) => {
	const otp = payload.otp;
	const email = payload.email.trim().toLowerCase();

	const existingUser = await prisma.user.findUnique({
		where: {
			email,
			role: Role.DOCTOR,
		},
	});

	if (!existingUser) {
		throw new Error("Doctor Application Not Found. Please Apply First");
	}

	if (existingUser.emailVerified) {
		throw new Error("Email is already verified");
	}

	const otpKey = `doctor-application-otp:${email}`;

	const redisOtp = await redisClient.get(otpKey);

	if (!redisOtp) {
		throw new Error(
			"Otp Expired. Your Application is Expired. please apply again",
		);
	}

	if (redisOtp !== otp) {
		throw new Error("Otp does not match");
	}
	await redisClient.del(otpKey);

	const verifiedUser = await prisma.user.update({
		where: {
			id: existingUser.id,
		},
		data: { emailVerified: true },
		omit: { password: true },
		include: { doctor: true },
	});

	return verifiedUser;
};

const approveDoctor = async (
	payload: IApproveDoctorPayload,
	reviewer: RequestUser,
) => {
	const { doctorId, verificationStatus, rejectionReason } = payload;

	const existingDoctor = await prisma.doctor.findUnique({
		where: {
			id: doctorId,
		},
		include: { user: true },
	});

	if (!existingDoctor) {
		throw new Error("Doctor Application Not Found. Please Apply First");
	}

	if (existingDoctor.isDeleted) {
		throw new Error("Doctor is already deleted");
	}

	if (!existingDoctor.user.emailVerified) {
		throw new Error("Email is not verified. Application cannot Be Reviewed");
	}

	if (existingDoctor.verificationStatus !== DoctorVerificationStatus.PENDING) {
		throw new Error(
			`Doctor is already ${existingDoctor.verificationStatus.toLowerCase()}`,
		);
	}

	if (
		verificationStatus === DoctorVerificationStatus.REJECTED &&
		!rejectionReason
	) {
		throw new Error("Rejection Reason is required");
	}

	const updatedDoctor = await prisma.doctor.update({
		where: {
			id: doctorId,
		},
		data: {
			verificationStatus,
			rejectedReason:
				verificationStatus === DoctorVerificationStatus.REJECTED
					? rejectionReason
					: null,
			reviewedBy: reviewer.userId,
			reviewedAt: new Date(),
		},
		include: {
			user: true,
		},
	});

	const isApprove = verificationStatus === DoctorVerificationStatus.APPROVED;

	const tempatePath = path.join(
		process.cwd(),
		`src/app/templates/
		${
			isApprove
				? "doctor-application-approved.ejs"
				: "doctor-application-rejected.ejs"
		}`,
	);

	const templateData = {
		name: existingDoctor.user.name,
		reason: rejectionReason,
	};

	const html = await ejs.renderFile(tempatePath, templateData);

	await transporter.sendMail({
		from: config.email_sender,
		to: existingDoctor.user.email,
		subject: isApprove
			? "Doctor Application Approved"
			: "Doctor Application Rejected",
		html,
	});

	return updatedDoctor;
};

const getAllDoctor = async () => {
	const allDoctors = await prisma.doctor.findMany({
		where: {
			isDeleted: false,
		},
		include: {
			user: true,
		},
	});

	return allDoctors;
};

export const DoctorService = {
	applyDoctor,
	verifyDoctorEmail,
	approveDoctor,
	getAllDoctor,
};
