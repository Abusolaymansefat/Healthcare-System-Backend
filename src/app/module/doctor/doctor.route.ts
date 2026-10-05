import { Router } from "express";
import { upload } from "../../lib/multer";
import { DoctorController } from "./doctor.controller";

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
export const DoctorRoutes = router;
