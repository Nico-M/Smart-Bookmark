import { z } from "zod";

const rawGroupPlanSchema = z
  .object({
    groupPath: z.array(z.string().min(1)).min(1).optional(),
    groupName: z.string().min(1).optional(),
    bookmarkIds: z.array(z.string()),
    reason: z.string().optional()
  })
  .superRefine((value, ctx) => {
    if (value.groupPath?.length || value.groupName?.trim()) {
      return;
    }
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "groupPath 或 groupName 至少提供一个"
    });
  });

export const groupPlanSchema = rawGroupPlanSchema.transform((value) => {
  const rawPath = value.groupPath?.length ? value.groupPath : [value.groupName ?? ""];
  const groupPath = rawPath
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);

  return {
    groupPath: groupPath.length > 0 ? groupPath : ["未分类"],
    bookmarkIds: value.bookmarkIds,
    reason: value.reason
  };
});

export const aiOutputSchema = z.object({
  groups: z.array(groupPlanSchema)
});

export type AiOutput = z.infer<typeof aiOutputSchema>;
