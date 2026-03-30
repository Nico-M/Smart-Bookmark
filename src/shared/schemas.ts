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

const facetSchema = z.object({
  id: z.string().min(1),
  primary_topic: z.string().min(1),
  resource_type: z.string().min(1),
  source_type: z.string().min(1),
  usage_intent: z.string().min(1),
  scope: z.string().min(1),
  confidence: z.number().min(0).max(1).optional()
});

export const aiOutputSchema = z.object({
  groups: z.array(groupPlanSchema),
  facets: z.array(facetSchema).optional()
});

export const aiGroupReviewOutputSchema = z.object({
  groups: z.array(
    z.object({
      groupPath: z.array(z.string().min(1)).min(1),
      groupIds: z.array(z.string().min(1)).min(1),
      reason: z.string().optional()
    })
  )
});

export type AiOutput = z.infer<typeof aiOutputSchema>;
export type AiGroupReviewOutput = z.infer<typeof aiGroupReviewOutputSchema>;
