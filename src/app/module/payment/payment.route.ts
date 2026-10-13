import { Router } from "express";
import { PaymentController } from "./payment.controller";
import { auth } from "../../middleware/checkAuth";
import { Role } from "../../../generated/prisma/enums";

const router = Router();

router.get("/my-payment", auth(Role.PATIENT), PaymentController.getMyPayment);
router.get(
	"/all-payment",
	auth(Role.ADMIN, Role.SUPER_ADMIN),
	PaymentController.getAllPayment,
);
router.get(
	"/:paymentId",
	auth(Role.ADMIN, Role.SUPER_ADMIN, Role.PATIENT),
	PaymentController.getSinglePayment,
);

export const PaymentRoutes = router;
