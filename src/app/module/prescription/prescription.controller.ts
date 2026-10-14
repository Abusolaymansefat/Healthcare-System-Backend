import { Request, Response } from "express";
import httpStatus from "http-status";
import { sendResponse } from "../../utils/sendResponse";
import { catchAsync } from "../../utils/catchAsync";
import { PrescriptionService } from "./prescription.service";

const createPrescription = catchAsync(async (req: Request, res: Response) => {
	const payload = req.body;
	const user = req.user!;

	const result = await PrescriptionService.createPrescription(payload, user);
	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Prescription created successfully",
		data: result,
	});
});

const getSinglePrescription = catchAsync(
	async (req: Request, res: Response) => {
		const prescriptionId = req.params.prescriptionId as string;
		const user = req.user!;

		const result = await PrescriptionService.getSinglePrescription(
			prescriptionId,
			user,
		);
		sendResponse(res, {
			statusCode: httpStatus.OK,
			success: true,
			message: "Prescription retrieved successfully",
			data: result,
		});
	},
);

export const PrescriptionController = {
	createPrescription,
	getSinglePrescription,
};
