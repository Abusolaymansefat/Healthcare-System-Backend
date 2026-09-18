import type z from "zod";
import { catchAsync } from "../utils/catchAsync";
import type { NextFunction, Request, Response } from "express";

export const validateRequest = (zodSchema: z.ZodObject) => {
	return catchAsync((req: Request, res: Response, next: NextFunction) => {
		try {
			const payload = req.body ?? {};

			const result = zodSchema.safeParse(payload);

			if (!result.success) {
				throw new Error(result.error.issues[0].message);
			}

			req.body = result.data;

			next();
		} catch (error) {
			next(error);
		}
	});
};
