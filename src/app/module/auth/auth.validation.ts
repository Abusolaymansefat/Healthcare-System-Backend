import z from "zod";

const patientRegitrationZodSchema = z.object({
	name: z
		.string("Not A String!!")
		.min(3, { message: "Name must be at least 3 characters long!!" })
		.max(20, { message: " Name must be at list 20 characters Long!!" }),
	email: z
		.string("Not A String!!")
		.email({ message: "Please provide a valid email address" }),
	password: z
		.string("Not A String!!")
		.min(8, { message: "Password must be at least 8 characters long!!" })
		.regex(/[A-Z]/, {
			message: "Password must contain at least one uppercase letter",
		})
		.regex(/[a-z]/, {
			message: "Password must contain at least one lowercase letter",
		})
		.regex(/[0-9]/, { message: "Password must contain at least one number" })
		.regex(/[^A-Za-z0-9]/, {
			message: "Password must contain at least one special character",
		}),
	patient: z
		.object({
			contactNumber: z.string().optional(),
		})
		.optional(),
});

const loginUserZodSchema = z.object({
	email: z
		.string("Not A String!!")
		.email({ message: "Please provide a valid email address" }),
	password: z
		.string("Not A String!!")
		.min(8, { message: "Password must be at least 8 characters long!!" })
		.regex(/[A-Z]/, {
			message: "Password must contain at least one uppercase letter",
		})
		.regex(/[a-z]/, {
			message: "Password must contain at least one lowercase letter",
		})
		.regex(/[0-9]/, { message: "Password must contain at least one number" })
		.regex(/[^A-Za-z0-9]/, {
			message: "Password must contain at least one special character",
		}),
	patient: z
		.object({
			contactNumber: z.string().optional(),
		})
		.optional(),
});
export const UserValidation = {
	patientRegitrationZodSchema,
	loginUserZodSchema,
};
