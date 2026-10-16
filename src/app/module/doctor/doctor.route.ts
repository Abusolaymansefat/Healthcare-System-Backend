import { Router } from "express";
import { upload } from "../../lib/multer";
import { DoctorController } from "./doctor.controller";
import { auth } from "../../middleware/checkAuth";
import { Role } from "../../../generated/prisma/enums";
import {
	validateParamsRequest,
	validateQueryRequest,
	validateRequest,
} from "../../middleware/validateRequest";
import {
	DoctorPublicListQueryValidationZodSchema,
	DoctorPublicProfileParamsValidationZodSchema,
	UpdateDoctorProfileValidationZodSchema,
} from "./doctor.validation";

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

router.get(
	"/available-doctors",
	validateQueryRequest(DoctorPublicListQueryValidationZodSchema),
	DoctorController.getAvailableDoctors,
);

router.get(
	"/public-doctors",
	validateQueryRequest(DoctorPublicListQueryValidationZodSchema),
	DoctorController.getAllDoctorListPublic,
);

router.get(
	"/:doctorId/public-profile",
	validateParamsRequest(DoctorPublicProfileParamsValidationZodSchema),
	DoctorController.getSingleDoctorPublicProfile,
);

router.patch(
	"/update-my-profile",
	auth(Role.DOCTOR),
	validateRequest(UpdateDoctorProfileValidationZodSchema),
	DoctorController.updateDoctorProfile,
);

export const DoctorRoutes = router;
