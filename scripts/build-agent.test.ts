import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { KIND_RULES, pageRules } from '../server/prompts.ts';
import { agentBody, agentFiles, ROOT, SKILL_DESCRIPTION, SKILL_FILE, SKILL_NAME, UNIVERSAL_FILE } from './build-agent.ts';

function committed(path: string): string {
  try {
    return readFileSync(join(ROOT, path), 'utf8').replace(/\r\n/g, '\n');
  } catch {
    return '';
  }
}

describe('agent in agente/', () => {
  for (const file of agentFiles()) {
    it(`${file.path} is what the generator writes`, () => {
      expect(committed(file.path), `${file.path} is out of date: run \`pnpm agent\``).toBe(file.content);
    });
  }

  it('carries the rules of the app, except how the person\'s images arrive', () => {
    const body = agentBody();
    // The rule blocks go in nested one or two heading levels down; their text is untouched.
    const appRules = pageRules('').split('\n').filter((line) => line !== '' && !line.startsWith('#'));
    for (const line of appRules) expect(body).toContain(line);
    for (const line of KIND_RULES.split('\n').filter((l) => l !== '' && !l.startsWith('#'))) expect(body).toContain(line);
    expect(body).not.toContain('attachment:');
    expect(body).toContain('src="logo.png"');
  });

  it('gives the skill the same body under Agent Skills frontmatter', () => {
    const [universal, skill] = agentFiles();
    expect(universal.path).toBe(UNIVERSAL_FILE);
    expect(skill.path).toBe(SKILL_FILE);
    // The name is the command people type (/html), and the folder must carry the same name.
    expect(SKILL_NAME).toBe('html');
    expect(SKILL_FILE).toBe(`agente/${SKILL_NAME}/SKILL.md`);
    expect(skill.content.startsWith(`---\nname: ${SKILL_NAME}\ndescription: `)).toBe(true);
    expect(skill.content.endsWith(`\n---\n\n${universal.content}`)).toBe(true);
    // A plain YAML scalar: no ": " or " #", and within the Agent Skills limit.
    expect(SKILL_DESCRIPTION).not.toMatch(/: | #|[<>]/);
    expect(SKILL_DESCRIPTION.length).toBeLessThanOrEqual(1024);
  });
});
