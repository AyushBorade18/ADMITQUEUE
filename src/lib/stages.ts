// Admission workflow stages of THIS demonstration system. They are not official CET Cell decisions.
// The database function stage_transition_allowed() is the rule that is enforced; this file mirrors it so the
// admin screen can offer only valid choices (a test compares both).

export const STAGES = [
  'registration',
  'profile_verification',
  'preference_preparation',
  'allotment_recorded',
  'acceptance_reporting',
  'next_round_consideration',
  'admission_completed',
] as const;

export type Stage = (typeof STAGES)[number];

export const STAGE_LABEL: Record<Stage, string> = {
  registration: 'Registration',
  profile_verification: 'Profile verification',
  preference_preparation: 'Preference preparation',
  allotment_recorded: 'Allotment recorded',
  acceptance_reporting: 'Acceptance / reporting',
  next_round_consideration: 'Next-round consideration',
  admission_completed: 'Admission completed',
};

export function isStage(value: unknown): value is Stage {
  return typeof value === 'string' && (STAGES as readonly string[]).includes(value);
}

export function stageIndex(stage: Stage): number {
  return STAGES.indexOf(stage) + 1;
}

export function stageTransitionAllowed(from: Stage, to: Stage, hasAllotment: boolean): boolean {
  const i = stageIndex(from);
  const j = stageIndex(to);
  if (i === j) return false;
  if (j < i) return true;
  if (j > i + 1 && !(from === 'acceptance_reporting' && to === 'admission_completed')) return false;
  if (j >= 4 && !hasAllotment) return false;
  return true;
}

export function allowedNextStages(from: Stage, hasAllotment: boolean): Stage[] {
  return STAGES.filter((s) => stageTransitionAllowed(from, s, hasAllotment));
}

export const DOC_STATUS_LABEL: Record<string, string> = {
  not_started: 'Not started',
  in_progress: 'In progress',
  ready: 'Ready',
  verified: 'Verified by staff',
  rejected: 'Needs correction',
};
