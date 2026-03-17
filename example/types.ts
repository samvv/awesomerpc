import t, { type Infer } from "reflect-types";

export const productT = t.object({
    id: t.uuid4(),
    title: t.string(),
    description: t.optional(t.string()),
    createdAt: t.date(),
    updatedAt: t.date(),
});

export type Product = Infer<typeof productT>;

