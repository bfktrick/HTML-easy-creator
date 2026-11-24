import { describe, expect, it } from 'vitest';
import { PAGE_KINDS } from '../shared/page-kind.ts';
import {
  EDIT_SYSTEM_PROMPT,
  kindLine,
  PAGE_SYSTEM_PROMPT,
  pageUserPrompt,
  questionsSystemPrompt,
  questionsUserPrompt,
} from './prompts.ts';

describe('page prompts and kinds', () => {
  it('has a section for every kind and the rule for choosing one, in one stable system prompt', () => {
    for (const kind of PAGE_KINDS) expect(PAGE_SYSTEM_PROMPT).toContain(`## Kind: ${kind}`);
    expect(PAGE_SYSTEM_PROMPT).toContain('When the request leaves the kind to you');
    expect(PAGE_SYSTEM_PROMPT).toContain('data-kind');
    // The kind travels in the user prompt, so the system prompt can stay cached.
    expect(PAGE_SYSTEM_PROMPT).not.toContain('Kind: not chosen');
  });

  it('carries the rules each kind needs', () => {
    expect(PAGE_SYSTEM_PROMPT).toMatch(/ArrowLeft.*PageUp.*Shift\+Space/s);
    expect(PAGE_SYSTEM_PROMPT).toContain('@page { size: landscape');
    expect(PAGE_SYSTEM_PROMPT).toContain('history.replaceState');
    expect(PAGE_SYSTEM_PROMPT).toContain('no href="#"');
    expect(PAGE_SYSTEM_PROMPT).toContain('<noscript>');
    expect(PAGE_SYSTEM_PROMPT).toMatch(/localStorage.*try\/catch/s);
  });

  it('states the chosen kind in the user prompt', () => {
    for (const kind of PAGE_KINDS) {
      const prompt = pageUserPrompt('Material', [], kind);
      expect(prompt.startsWith(`Kind: ${kind}.`)).toBe(true);
      expect(prompt).toContain(`data-kind="${kind}"`);
      expect(prompt).toContain('<material>\nMaterial\n</material>');
    }
  });

  it('leaves the kind to the model when it is "auto", which is also the default', () => {
    expect(pageUserPrompt('Material')).toBe(pageUserPrompt('Material', [], 'auto'));
    expect(pageUserPrompt('Material')).toContain(kindLine('auto'));
    expect(kindLine('auto')).toContain('"Kind of page"');
  });

  it('keeps the answers block with a kind', () => {
    const prompt = pageUserPrompt('Material', [{ question: '¿Cuántas diapositivas?', answer: 'Diez' }], 'slides');
    expect(prompt).toContain('Kind: slides.');
    expect(prompt).toContain('<answers>');
  });

  it('gives the edit prompt the same kind rules, so a change keeps the page what it is', () => {
    const rules = PAGE_SYSTEM_PROMPT.slice(PAGE_SYSTEM_PROMPT.indexOf('# File'));
    expect(EDIT_SYSTEM_PROMPT.endsWith(rules)).toBe(true);
    expect(EDIT_SYSTEM_PROMPT).toContain('keeps the kind it declares');
  });
});

describe('question prompts and kinds', () => {
  it('adapts the topics to each kind and keeps the decision rule for "auto"', () => {
    const system = questionsSystemPrompt('es');
    for (const kind of PAGE_KINDS) expect(system).toContain(`- ${kind}:`);
    expect(system).toMatch(/slides: who the audience is, how long the talk is/);
    expect(system).toMatch(/landing: the one action the reader should take/);
    expect(system).toMatch(/app: what the tool must do/);
    expect(system).toContain('a document by default');
    expect(system).toContain('Ask between 2 and 4 questions');
  });

  it('states the kind in the user prompt', () => {
    expect(questionsUserPrompt('Material', 'landing')).toBe('Kind: landing.\n\n<material>\nMaterial\n</material>');
    expect(questionsUserPrompt('Material')).toBe('Kind: not chosen.\n\n<material>\nMaterial\n</material>');
  });
});

// The text the app sends to the models. Building it from exported blocks (for the agent in
// agente/) must not change a byte of it; update the snapshot only for an intended change.
describe('system prompts sent to the models', () => {
  it('stay byte-identical', () => {
    expect(PAGE_SYSTEM_PROMPT).toMatchSnapshot('page');
    expect(EDIT_SYSTEM_PROMPT).toMatchSnapshot('edit');
    expect(questionsSystemPrompt('es')).toMatchSnapshot('questions es');
    expect(questionsSystemPrompt('en')).toMatchSnapshot('questions en');
  });
});
