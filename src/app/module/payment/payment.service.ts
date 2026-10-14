import httpStatus from "http-status";
import { Role } from "../../../generated/prisma/enums";
import { PaymentWhereInput } from "../../../generated/prisma/models";
import { IQuery } from "../../../interfaces";
import { prisma } from "../../lib/prisma";
import { RequestUser } from "../../middleware/checkAuth";
import { AppError } from "../../utils/appError";

const getMyPayment = async (query: IQuery, user: RequestUser) => {
	const limit = query.limit ? Number(query.limit) : 10;
	const page = query.page ? Number(query.page) : 1;
	const skip = (page - 1) * limit;
	const sortBy = query.sortBy ? query.sortBy : "createdAt";
	const sortOrder = query.sortOrder ? query.sortOrder : "desc";

	const patient = await prisma.patient.findUnique({
		where: { userId: user.userId },
	});

	if (!patient) {
		throw new AppError(httpStatus.NOT_FOUND, "Patient not found");
	}

	const andCondition: PaymentWhereInput[] = [
		{
			appointment: {
				patientId: patient.id,
			},
		},
	];

	const payments = await prisma.payment.findMany({
		where: {
			AND: andCondition,
		},
		skip,
		take: limit,
		orderBy: {
			[sortBy]: sortOrder,
		},
		include: {
			appointment: {
				include: {
					doctor: { select: { id: true, name: true, specialization: true } },
					schedule: true,
				},
			},
		},
	});

	const total = await prisma.payment.count({
		where: {
			AND: andCondition,
		},
	});

	return {
		data: payments,
		meta: {
			page,
			limit,
			total,
			totalPages: Math.ceil(total / limit),
		},
	};
};
const getAllPayment = async (query: IQuery) => {
	const limit = query.limit ? Number(query.limit) : 10;
	const page = query.page ? Number(query.page) : 1;
	const skip = (page - 1) * limit;
	const sortBy = query.sortBy ? query.sortBy : "createdAt";
	const sortOrder = query.sortOrder ? query.sortOrder : "desc";

	const andCondition: PaymentWhereInput[] = [];

	if (query.patientEmail) {
		andCondition.push({
			appointment: {
				patient: {
					email: query.patientEmail,
				},
			},
		});
	}

	const payments = await prisma.payment.findMany({
		where: {
			AND: andCondition,
		},
		skip,
		take: limit,
		orderBy: {
			[sortBy]: sortOrder,
		},
		include: {
			appointment: {
				include: {
					doctor: { select: { id: true, name: true, specialization: true } },
					schedule: true,
				},
			},
		},
	});

	const total = await prisma.payment.count({
		where: {
			AND: andCondition,
		},
	});

	return {
		data: payments,
		meta: {
			page,
			limit,
			total,
			totalPages: Math.ceil(total / limit),
		},
	};
};
const getSinglePayment = async (paymentId: string, user: RequestUser) => {
	const payment = await prisma.payment.findUnique({
		where: { id: paymentId },
		include: {
			appointment: {
				include: {
					patient: {
						select: {
							id: true,
							name: true,
							email: true,
							contactNumber: true,
							userId: true,
						},
					},
					doctor: { select: { id: true, name: true, specialization: true } },
					schedule: true,
				},
			},
		},
	});

	if (!payment) {
		throw new AppError(httpStatus.NOT_FOUND, "Payment not found");
	}

	if (user.role === Role.PATIENT) {
		if (payment.appointment?.patient?.userId !== user.userId) {
			throw new AppError(
				httpStatus.FORBIDDEN,
				"You are not authorized to view this payment",
			);
		}
	}

	return payment;
};

export const PaymentService = {
	getMyPayment,
	getAllPayment,
	getSinglePayment,
};
