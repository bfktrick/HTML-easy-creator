import { useState } from 'react';
import type { Answer, Question } from '../../shared/questions.ts';
import { buildAnswers, chooseOption, EMPTY_DRAFT, typeAnswer, type Draft } from '../chat/answers.ts';
import { useI18n } from '../i18n/I18nProvider.tsx';

interface QuestionsCardProps {
  questions: Question[];
  state: 'open' | 'answered' | 'skipped';
  answers: Answer[];
  onSubmit: (answers: Answer[]) => void;
  onSkip: () => void;
}

export function QuestionsCard({ questions, state, answers, onSubmit, onSkip }: QuestionsCardProps) {
  const { t } = useI18n();
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});

  if (state !== 'open') {
    return (
      <dl className="answers">
        {questions.map((question) => (
          <div key={question.id}>
            <dt>{question.text}</dt>
            <dd>{answers.find((a) => a.question === question.text)?.answer ?? t('questions.unanswered')}</dd>
          </div>
        ))}
      </dl>
    );
  }

  function update(question: Question, change: (draft: Draft) => Draft) {
    setDrafts((all) => ({ ...all, [question.id]: change(all[question.id] ?? EMPTY_DRAFT) }));
  }

  return (
    <form
      className="questions"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(buildAnswers(questions, drafts));
      }}
    >
      <p className="message-text">{t('questions.intro')}</p>

      {questions.map((question) => {
        const draft = drafts[question.id] ?? EMPTY_DRAFT;
        const name = `answer-${question.id}`;
        return (
          <fieldset key={question.id} className="question">
            <legend>{question.text}</legend>

            {question.kind === 'text' ? (
              <input
                className="input"
                aria-label={question.text}
                placeholder={question.placeholder}
                value={draft.text}
                onChange={(event) => update(question, (d) => typeAnswer(question, d, event.target.value))}
              />
            ) : (
              <>
                <div className="choices">
                  {question.options.map((option, index) => (
                    <label key={option.label} className="choice">
                      <input
                        type={question.kind === 'single' ? 'radio' : 'checkbox'}
                        name={name}
                        checked={draft.chosen.includes(index)}
                        onChange={() => update(question, (d) => chooseOption(question, d, index))}
                      />
                      <span>
                        <span className="choice-label">{option.label}</span>
                        {option.description && <span className="choice-description">{option.description}</span>}
                      </span>
                    </label>
                  ))}
                </div>
                <input
                  className="input"
                  aria-label={`${question.text} · ${t('questions.other')}`}
                  placeholder={t('questions.other')}
                  value={draft.text}
                  onChange={(event) => update(question, (d) => typeAnswer(question, d, event.target.value))}
                />
              </>
            )}
          </fieldset>
        );
      })}

      <div className="field-row">
        <button type="submit" className="button primary">
          {t('questions.submit')}
        </button>
        <button type="button" className="button" onClick={onSkip}>
          {t('questions.skip')}
        </button>
      </div>
    </form>
  );
}
