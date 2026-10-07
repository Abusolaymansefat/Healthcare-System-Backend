import cron from "node-cron";
import { prisma } from "./prisma";
import { DoctorVerificationStatus, Role } from "../../generated/prisma/enums";

export const deleteUnverifiedDoctor = async () => {
	cron.schedule(" */10 * * * *", async () => {
		// prisma business => Doctors delete after 24 hours

		try {
			const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
			const deleteDoctor = await prisma.user.deleteMany({
				where: {
					role: Role.DOCTOR,
					emailVerified: false,
					createdAt: {
						lt: oneHourAgo,
					},
					doctor: {
						verificationStatus: DoctorVerificationStatus.PENDING,
					},
				},
			});

			if (deleteDoctor.count > 0) {
				console.log(
					`Cron: Deleted ${deleteDoctor.count} unverified email doctor applications older then 1 hours from database`,
				);
			}
		} catch (error) {
			console.log(
				"cron : Failed to delete unverified doctor Application",
				error,
			);
		}

		console.log(
			"unverified Doctor Deleted Cron Job schedule (every 10 minutes)",
		);
	});
};
