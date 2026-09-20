import { Router } from "express";
import { Role } from "../../../generated/prisma/enums";
import { auth } from "../../middleware/checkAuth";
import { AuthController } from "./auth.controller";
import { UserValidation } from "./auth.validation";
import z from "zod";
import { validateRequest } from "../../middleware/validateRequest";

const router = Router();

router.post(
	"/register",
	// (req: Request, res: Response, next: NextFunction) => {
	// 	try {
	// 		const payload = req.body ?? {};

	// 		const result = patientValidation.patientRegitrationZodSchema.safeParse(payload);

	// 		if (!result.success) {
	// 			throw new Error(result.error.issues[0].message)
	// 		}

	// 		req.body = result.data

	// 		next();
	// 	} catch (error) {
	// 		next(error);
	// 	}
	// },
	validateRequest(UserValidation.patientRegitrationZodSchema),
	AuthController.registerPatient,
);

router.post(
	"/login",
	validateRequest(UserValidation.loginUserZodSchema),
	AuthController.loginUser,
);
router.get(
	"/me",
	auth(Role.ADMIN, Role.DOCTOR, Role.PATIENT, Role.SUPER_ADMIN),
	AuthController.getMe,
);
router.post("/refresh-token", AuthController.refreshToken);

router.post("/google", AuthController.googleLogin);
router.post(
	"/forget-password",
	validateRequest(UserValidation.forgotPasswordZodSchema),
	AuthController.forgotPassword,
);
router.post(
	"/reset-password",
	validateRequest(UserValidation.resetPasswordZodSchema),
	AuthController.resetPassword,
);
export const AuthRoutes = router;
