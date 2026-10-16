import httpStatus from "http-status";
import {
	AppointmentStatus,
	DoctorVerificationStatus,
	PaymentStatus,
	ScheduleStatus,
} from "../../../generated/prisma/enums";
import { prisma } from "../../lib/prisma";
import { RequestUser } from "../../middleware/checkAuth";
import { AppError } from "../../utils/appError";

const getAdminAnalytics = async () => {
	const totalDoctor = await prisma.doctor.count({
		where: {
			isDeleted: false,
		},
	});

	const totalPendingDoctorApplication = await prisma.doctor.count({
		where: {
			isDeleted: false,
			verificationStatus: DoctorVerificationStatus.PENDING,
		},
	});

	const approvedDoctor = await prisma.doctor.count({
		where: {
			isDeleted: false,
			verificationStatus: DoctorVerificationStatus.APPROVED,
		},
	});

	const rejectedDoctor = await prisma.doctor.count({
		where: {
			isDeleted: false,
			verificationStatus: DoctorVerificationStatus.REJECTED,
		},
	});

	const deletedDoctor = await prisma.doctor.count({
		where: {
			isDeleted: true,
		},
	});

	const totalPatient = await prisma.patient.count({
		where: {
			isDeleted: false,
		},
	});

	const totalAppointments = await prisma.appointment.count();

	const completedAppointments = await prisma.appointment.count({
		where: { status: AppointmentStatus.COMPLETED },
	});

	const cancelledAppointments = await prisma.appointment.count({
		where: { status: AppointmentStatus.CANCELLED },
	});

	const pendingAppointments = await prisma.appointment.count({
		where: { status: AppointmentStatus.PENDING },
	});

	const totalRefundResult = await prisma.payment.aggregate({
		where: {
			status: PaymentStatus.REFUNDED,
		},
		_sum: {
			amount: true,
		},
	});

	const totalRefund = totalRefundResult._sum.amount?.toNumber() || 0;

	const totalRevenueResult = await prisma.payment.aggregate({
		where: {
			status: PaymentStatus.PAID,
		},
		_sum: {
			amount: true,
		},
	});

	const totalRevenue =
		(totalRevenueResult._sum.amount?.toNumber() || 0) - totalRefund;

	return {
		totalDoctor,
		totalPendingDoctorApplication,
		approvedDoctor,
		rejectedDoctor,
		deletedDoctor,
		totalPatient,
		totalAppointments,
		completedAppointments,
		cancelledAppointments,
		pendingAppointments,
		totalRevenue,
		totalRefund,
	};
};

const getPatientAnalytics = async (user: RequestUser) => {
	const patient = await prisma.patient.findUnique({
		where: { userId: user.userId },
	});

	if (!patient) {
		throw new AppError(httpStatus.NOT_FOUND, "Patient not found");
	}

	const totalAppointments = await prisma.appointment.count({
		where: { patientId: patient.id },
	});

	const upcomingAppointments = await prisma.appointment.count({
		where: { patientId: patient.id, status: AppointmentStatus.PENDING },
	});

	const completedAppointments = await prisma.appointment.count({
		where: { patientId: patient.id, status: AppointmentStatus.COMPLETED },
	});

	const cancelledAppointments = await prisma.appointment.count({
		where: { patientId: patient.id, status: AppointmentStatus.CANCELLED },
	});

	const totalAmountSpentResult = await prisma.payment.aggregate({
		where: {
			appointment: {
				patientId: patient.id,
			},
			status: PaymentStatus.PAID,
		},
		_sum: {
			amount: true,
		},
	});

	const totalAmountSpent = totalAmountSpentResult._sum.amount?.toNumber() || 0;

	const totalRefundResult = await prisma.payment.aggregate({
		where: {
			appointment: {
				patientId: patient.id,
			},
			status: PaymentStatus.REFUNDED,
		},
		_sum: {
			amount: true,
		},
	});

	const totalRefund = totalRefundResult._sum.amount?.toNumber() || 0;

	return {
		totalAppointments,
		upcomingAppointments,
		completedAppointments,
		cancelledAppointments,
		totalAmountSpent,
		totalRefund,
	};
};

const getDoctorAnalytics = async (user: RequestUser) => {
	const doctor = await prisma.doctor.findUnique({
		where: { userId: user.userId },
	});

	if (!doctor) {
		throw new AppError(httpStatus.NOT_FOUND, "Doctor not found");
	}

	const totalSchedules = await prisma.schedule.count({
		where: { doctorId: doctor.id, isDeleted: false },
	});

	const publishedSchedules = await prisma.schedule.count({
		where: {
			doctorId: doctor.id,
			isDeleted: false,
			status: ScheduleStatus.PUBLISHED,
		},
	});

	const totalAppointments = await prisma.appointment.count({
		where: { doctorId: doctor.id },
	});

	const completedAppointments = await prisma.appointment.count({
		where: { doctorId: doctor.id, status: AppointmentStatus.COMPLETED },
	});

	const cancelledAppointments = await prisma.appointment.count({
		where: { doctorId: doctor.id, status: AppointmentStatus.CANCELLED },
	});

	const ongoingAppointments = await prisma.appointment.count({
		where: { doctorId: doctor.id, status: AppointmentStatus.ONGOING },
	});

	const totalRefundResult = await prisma.payment.aggregate({
		where: {
			appointment: {
				doctorId: doctor.id,
			},
			status: PaymentStatus.REFUNDED,
		},
		_sum: {
			amount: true,
		},
	});

	const totalRefund = totalRefundResult._sum.amount?.toNumber() || 0;

	const totalDoctorEarningResult = await prisma.payment.aggregate({
		where: {
			appointment: {
				doctorId: doctor.id,
			},
			status: PaymentStatus.PAID,
		},
		_sum: {
			amount: true,
		},
	});

	const totalDoctorEarning =
		(totalDoctorEarningResult._sum.amount?.toNumber() || 0) - totalRefund;

	return {
		totalSchedules,
		publishedSchedules,
		totalAppointments,
		completedAppointments,
		cancelledAppointments,
		ongoingAppointments,
		totalDoctorEarning,
		totalRefund,
	};
};

export const AnalyticsService = {
	getAdminAnalytics,
	getPatientAnalytics,
	getDoctorAnalytics,
};
