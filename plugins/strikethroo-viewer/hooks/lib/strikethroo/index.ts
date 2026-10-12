/**
 * The Strikethroo workspace reader shared by every mod in this repository.
 * The source of truth is `shared/lib/` at the repository root;
 * `node scripts/sync-shared.ts` copies it into each plugin's
 * `hooks/lib/strikethroo/`. Edit it there, never in a copy.
 */
export type { BlueprintPhase, TaskFrontmatter, TaskStatus } from './parse.ts'
export { matchesArtifact, parseBlueprint, parseOutputArtifacts, parseTaskFrontmatter, parseTitle, TASK_STATUSES } from './parse.ts'
export type { Confidence, Finding, ReviewFindings, Severity } from './review.ts'
export { CONFIDENCES, parseReviewFindings, REVIEW_LIMITS, SEVERITIES } from './review.ts'
export type { FsEntryLike, Plan, ReviewFile, Task, WorkspaceFs, WorkspaceLookup } from './workspace.ts'
export { findWorkspace, listActivePlans, listReviewFiles, pickActivePlan, planSignature, SUPPORTED_SCHEMA_VERSION } from './workspace.ts'
