import { Router } from "express";
import { upload } from "../../lib/multer";
import { DoctorController } from "./doctor.controller";
import { auth } from "../../middleware/checkAuth";
import { Role } from "../../../generated/prisma/enums";

const router = Router();

router.post(
	"/apply-doctor",
	upload.fields([
		{
			name: "resume",
			maxCount: 1,
		},
		{
			name: "resumeFile",
			maxCount: 1,
		},
		{
			name: "additionalFiles",
			maxCount: 10,
		},
	]),
	DoctorController.applyAsDoctor,
);

router.post("/apply-doctor/verify-email", DoctorController.verifyDoctorEmail);

router.post(
	"/approve-doctor",
	auth(Role.SUPER_ADMIN, Role.ADMIN),
	DoctorController.approveDoctor,
);
router.get(
	"/all-doctors",
	auth(Role.SUPER_ADMIN, Role.ADMIN),
	DoctorController.getAllDoctor,
);

export const DoctorRoutes = router;
