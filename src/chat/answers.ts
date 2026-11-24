import type { Answer, Question, QuestionOption } from '../../shared/questions.ts';

export interface Draft {
  /** Indexes of the chosen options. */
  chosen: number[];
  /** Free text: the answer of a "text" question, or "another answer" for the others. */
  text: string;
}

export const EMPTY_DRAFT: Draft = { chosen: [], text: '' };

// The page model gets the description too: "Ficha de biblioteca" alone says little.
function describe(option: QuestionOption): string {
  return option.description ? `${option.label} (${option.description})` : option.label;
}

/** Answers for the questions the person actually answered; the rest is left to the AI. */
export function buildAnswers(questions: Question[], drafts: Record<string, Draft>): Answer[] {
  const answers: Answer[] = [];
  for (const question of questions) {
    const draft = drafts[question.id] ?? EMPTY_DRAFT;
    const parts = draft.chosen
      .map((i) => question.options[i])
      .filter((option): option is QuestionOption => option !== undefined)
      .map(describe);
    if (draft.text.trim()) parts.push(draft.text.trim());
    if (parts.length) answers.push({ question: question.text, answer: parts.join('; ') });
  }
  return answers;
}

/** What a single-choice click or a typed answer does to a draft. */
export function chooseOption(question: Question, draft: Draft, index: number): Draft {
  if (question.kind === 'single') return { chosen: [index], text: '' };
  const chosen = draft.chosen.includes(index) ? draft.chosen.filter((i) => i !== index) : [...draft.chosen, index];
  return { ...draft, chosen };
}

export function typeAnswer(question: Question, draft: Draft, text: string): Draft {
  // In a single-choice question, typing your own answer replaces the chosen option.
  return { chosen: question.kind === 'single' && text ? [] : draft.chosen, text };
}
