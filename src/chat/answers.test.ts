import { describe, expect, it } from 'vitest';
import type { Question } from '../../shared/questions.ts';
import { buildAnswers, chooseOption, EMPTY_DRAFT, typeAnswer } from './answers.ts';

const style: Question = {
  id: 'style',
  text: '¿Qué aspecto?',
  kind: 'single',
  options: [
    { label: 'Ficha de biblioteca', description: 'Sellos de tinta sobre papel rayado.' },
    { label: 'Lectura nocturna', description: '' },
  ],
  placeholder: '',
};
const include: Question = { ...style, id: 'include', text: '¿Qué incluir?', kind: 'multi' };
const when: Question = { id: 'when', text: '¿Cuándo?', kind: 'text', options: [], placeholder: 'Ej.: jueves' };

describe('buildAnswers', () => {
  it('sends the chosen option with its description', () => {
    expect(buildAnswers([style], { style: { chosen: [0], text: '' } })).toEqual([
      { question: '¿Qué aspecto?', answer: 'Ficha de biblioteca (Sellos de tinta sobre papel rayado.)' },
    ]);
  });

  it('joins several choices and the typed extra', () => {
    expect(buildAnswers([include], { include: { chosen: [0, 1], text: ' fotos de las reuniones ' } })).toEqual([
      {
        question: '¿Qué incluir?',
        answer: 'Ficha de biblioteca (Sellos de tinta sobre papel rayado.); Lectura nocturna; fotos de las reuniones',
      },
    ]);
  });

  it('leaves unanswered questions out', () => {
    expect(buildAnswers([style, when], { when: { chosen: [], text: 'Último jueves, 19 h' } })).toEqual([
      { question: '¿Cuándo?', answer: 'Último jueves, 19 h' },
    ]);
    expect(buildAnswers([style, when], {})).toEqual([]);
  });
});

describe('chooseOption / typeAnswer', () => {
  it('keeps one option in single questions and replaces it with typed text', () => {
    const first = chooseOption(style, EMPTY_DRAFT, 0);
    expect(chooseOption(style, first, 1)).toEqual({ chosen: [1], text: '' });
    expect(typeAnswer(style, first, 'Como un fanzine')).toEqual({ chosen: [], text: 'Como un fanzine' });
  });

  it('toggles options in multi questions and keeps them while typing', () => {
    const one = chooseOption(include, EMPTY_DRAFT, 0);
    const two = chooseOption(include, one, 1);
    expect(two.chosen).toEqual([0, 1]);
    expect(chooseOption(include, two, 0).chosen).toEqual([1]);
    expect(typeAnswer(include, two, 'y más').chosen).toEqual([0, 1]);
  });
});
