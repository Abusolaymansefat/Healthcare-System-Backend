import { UploadApiResponse } from "cloudinary";
import { prisma } from "../../lib/prisma";
import { cloudinary } from "../../lib/cloudinary";
import bcrypt from "bcryptjs";
import config from "../../config";
import { Role } from "../../../generated/prisma/enums";

const applyDoctor = async (
	payload: any,
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

	return doctorApplication;
};

export const DoctorService = {
	applyDoctor,
};
