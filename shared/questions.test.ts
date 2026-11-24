import { describe, expect, it } from 'vitest';
import { MAX_ANSWER_CHARS, MAX_OPTIONS, MAX_QUESTIONS, parseQuestions, sanitizeAnswers } from './questions.ts';

const style = {
  id: 'style',
  text: '¿Qué aspecto prefieres?',
  kind: 'single',
  options: [
    { label: 'Cuaderno de taller', description: 'Dibujos a línea y tonos tinta.' },
    { label: 'Cartel de barrio', description: '' },
  ],
  placeholder: '',
};

describe('parseQuestions', () => {
  it('accepts well-formed questions', () => {
    expect(parseQuestions({ questions: [style] })).toEqual([style]);
  });

  it('accepts the JSON text a model returns', () => {
    expect(parseQuestions(JSON.stringify({ questions: [style] }))).toEqual([style]);
  });

  it('returns nothing for malformed input', () => {
    expect(parseQuestions('not json')).toEqual([]);
    expect(parseQuestions({ questions: 'x' })).toEqual([]);
    expect(parseQuestions(null)).toEqual([]);
  });

  it('drops invalid questions and keeps the rest', () => {
    const questions = parseQuestions({
      questions: [
        { ...style, kind: 'slider' },
        { ...style, id: 'empty', text: '  ' },
        { ...style, id: 'single-without-options', options: [] },
        { id: 'date', text: '¿Qué día empieza?', kind: 'text', options: [], placeholder: 'Ej.: 12 de marzo' },
      ],
    });
    expect(questions.map((q) => q.id)).toEqual(['date']);
  });

  it('caps the number of questions and options and trims text', () => {
    const many = Array.from({ length: MAX_QUESTIONS + 3 }, (_, i) => ({
      ...style,
      id: `q${i}`,
      text: `  Pregunta ${i}  `,
      options: Array.from({ length: MAX_OPTIONS + 2 }, (_, j) => ({ label: ` Opción ${j} `, description: '' })),
    }));
    const questions = parseQuestions({ questions: many });
    expect(questions).toHaveLength(MAX_QUESTIONS);
    expect(questions[0].text).toBe('Pregunta 0');
    expect(questions[0].options).toHaveLength(MAX_OPTIONS);
    expect(questions[0].options[0].label).toBe('Opción 0');
  });

  it('makes ids unique and clears options on text questions', () => {
    const questions = parseQuestions({
      questions: [
        style,
        { ...style, text: 'Otra' },
        { id: 'where', text: '¿Dónde?', kind: 'text', options: [{ label: 'x', description: '' }], placeholder: '' },
      ],
    });
    expect(new Set(questions.map((q) => q.id)).size).toBe(3);
    expect(questions[2].options).toEqual([]);
  });
});

describe('sanitizeAnswers', () => {
  it('keeps answered questions', () => {
    expect(sanitizeAnswers([{ question: '¿Para quién?', answer: 'Familias del barrio' }])).toEqual([
      { question: '¿Para quién?', answer: 'Familias del barrio' },
    ]);
  });

  it('treats a missing list as no answers', () => {
    expect(sanitizeAnswers(undefined)).toEqual([]);
  });

  it('rejects anything else', () => {
    expect(sanitizeAnswers('x')).toBeNull();
    expect(sanitizeAnswers([{ question: 1, answer: 'a' }])).toBeNull();
    expect(sanitizeAnswers([{ question: 'q', answer: 'a'.repeat(MAX_ANSWER_CHARS + 1) }])).toBeNull();
    expect(sanitizeAnswers(Array.from({ length: 20 }, () => ({ question: 'q', answer: 'a' })))).toBeNull();
  });

  it('drops blank answers', () => {
    expect(sanitizeAnswers([{ question: 'q', answer: '   ' }])).toEqual([]);
  });
});
