import { Router } from "express";
import { AppointmentController } from "./appointment.controller";
import { auth } from "../../middleware/checkAuth";

const router = Router();

router.post(
	"/book-appointment",
	auth("PATIENT"),
	AppointmentController.bookAppointment,
);

// book appointment callback route
router.get(
	"/book-appointment/payment/callback",
	AppointmentController.bookAppointmentCallback,
);

export const AppointmentRoutes = router;
