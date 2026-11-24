// Instructions for the models that write and edit the page. Kept stable across requests so the
// provider can cache them. Model-facing text stays in English; the page itself is written
// in the language of the user's material.

import type { EditFailure, EditFailureReason } from '../shared/apply-edits.ts';
import { numberedImages, type ModelAttachment } from '../shared/attachments.ts';
import type { KindChoice, PageKind } from '../shared/page-kind.ts';
import type { Answer } from '../shared/questions.ts';

// --- Attached files (task 6) ------------------------------------------------------------------
// The person's images reach the page as src="attachment:N", which the browser swaps for the image
// itself: the model never copies image data, and versions stay small. PDFs are read as material.

const ATTACHED_IMAGES_RULES = `# The person's images
- When the person attached images, they are numbered in the order given: Image 1, Image 2 and so on. Show one on the page when it helps (a logo, a product, a place, people) with an <img> whose src is exactly "attachment:N", where N is its number, and an alt text that says what it shows. Leave out images that do not help.
- This is the only exception to the rule against image URLs: never write any other URL, path or data URI for an image. Illustrations, icons and diagrams stay drawn as inline SVG.
- Keep every src="attachment:N" already in the page exactly as written: the app replaces it with the image.`;

/** Lists the attached files after the prompt, numbered as the model received them. */
export function attachmentsNote(attachments: readonly ModelAttachment[], source: string): string {
  if (attachments.length === 0) return '';
  const images = new Map(numberedImages(attachments).map(({ n, image }) => [image, n]));
  const list = attachments
    .map((file) => (file.kind === 'pdf' ? `- Document: ${file.name}` : `- Image ${images.get(file)}: ${file.name}`))
    .join('\n');
  const intro =
    source.trim() === ''
      ? 'There is no text: the material is in the files the person attached, which come before this message'
      : 'The person also attached these files, which come before this message. Documents are part of the material';
  return `\n\n${intro}:\n${list}`;
}
// --- End of attached files --------------------------------------------------------------------

// The rules every version of the page follows. Both the prompt that writes the page and the
// one that edits it include them, so an edit never drifts from the rules the page was made with.
// The section on the person's images is a parameter: the agent in agente/ (scripts/build-agent.ts)
// shares every other rule but cannot embed the person's files.
export function pageRules(imagesRules: string): string {
  return `# File
- Everything lives in the file: CSS in <style>, JavaScript in <script>. Load nothing from the network: no external stylesheets, web fonts, scripts, images or iframes, and no image URLs of any kind (see "The person's images" for the one exception). Use system font stacks.
- Set <html lang> to the language of the material, write a specific <title> and a <meta name="description">, and include <meta name="viewport" content="width=device-width, initial-scale=1">.

# Content
- Write in the language of the material.
- Keep all of the substance: every step, figure, warning, name and link in the material. Do not drop sections to make the page shorter.
- Never invent facts, numbers, quotes, testimonials, prices, dates, people or contact details. If something is missing, leave it out instead of filling it with a placeholder.
- You may restructure for clarity: add headings, split long paragraphs, turn sequences into numbered steps, comparisons into tables and warnings into callouts, and add a short summary at the top when the material is long. Fix obvious typos. Keep the author's voice.
- If the material is only an idea or a brief, write the page it describes, with specific copy based only on what the idea says.

# Register
Read the material and choose how expressive the page should be. A technical manual, a policy or an internal procedure gets a calm, precise page that is still illustrated and diagrammed. An event, a product, a campaign or a personal project gets a bold page: large type, confident colour fields, an asymmetric layout, a strong opening illustration. Most material sits somewhere in between. Whatever the register, the page must feel designed for this material, never like a generic template.

# Illustrations
Apart from images the person attached, there are no photos: draw everything as inline SVG, by hand, for this material.
- Open the page with an illustration that shows the subject (the place, the object, the activity or the idea) in a consistent drawing style: flat shapes, line drawing, isometric, cut paper, technical blueprint, whatever suits the register. Use the page's palette.
- Add smaller spot illustrations or icons where they help a reader recognise a section or a step at a glance. Draw them in the same style; do not use emoji.
- Prefer a picture that explains over one that decorates: a labelled drawing of the object, a schematic of the space, a sequence of small drawings for the steps.
- Give meaningful SVG role="img" and a <title>; mark purely decorative SVG aria-hidden="true".

${imagesRules}

# Charts and diagrams
- When the material contains numbers that compare, add up or change over time, show them as a chart (inline SVG, or a canvas drawn with plain JavaScript) with labelled axes or values, and keep the exact figures readable in text or a table next to it.
- Never chart invented or estimated numbers. Without real figures, explain visually with diagrams: a process flow, a timeline, a decision tree, a cycle, a before and after, a map-like schematic.

# Motion and interaction
Use motion where it explains or rewards attention, and vary it from page to page instead of repeating one effect:
- diagrams and lines that draw themselves, numbers that count up, steps that light up in order as they scroll into view, a gentle loop in a detail of the opening illustration;
- interaction where it helps the reader: a checklist they can tick, tabs to switch between options, an accordion for questions, a step-through for a procedure, details that appear on hover or tap.
Rules:
- Use IntersectionObserver for scroll-triggered effects; never animate layout properties in a way that makes text jump.
- The content must be complete and readable without JavaScript and when printed: hide or offset elements only through a class that your script adds at runtime.
- Honour prefers-reduced-motion: reduce: show the final state with no movement.

# Structure
- Semantic HTML: header, nav, main, section or article, h1 to h3 in order, ol for steps, table with th for tabular data, figure and figcaption, pre and code for code.
- For documents and guides with more than four sections, a table of contents with anchor links; on wide screens it may stay visible beside the text.
- Comfortable reading: body text between 16 and 18px, lines of about 60 to 75 characters, generous line height and clear space between sections.
- Responsive down to 360px wide. Illustrations scale with the layout; wide tables and charts scroll inside their own container and never widen the page.
- Print styles (@media print): hide navigation and interactive controls, black text on white, avoid page breaks inside steps, tables and figures.
- Accessible: WCAG AA contrast, visible focus styles, keyboard-usable controls, and no information carried by colour alone.

# Visual design
Design it like a careful human designer with a clear point of view. Choose one direction and apply it consistently: one type scale, one spacing scale, a grid, and a palette of a few colours with one clear accent.

Avoid these patterns, which make pages look machine-made:
- cream, beige or off-white backgrounds combined with a serif display font and a terracotta or orange accent;
- purple-to-blue or other decorative gradients, blurred gradient blobs, glassmorphism;
- emoji used as icons or bullet points;
- italic or coloured accent words inside headlines;
- numbered section labels such as "01 / 02 / 03", or small uppercase monospace labels above every heading;
- pill-shaped buttons and badges everywhere, and cards with large rounded corners and soft drop shadows around every block;
- the same fade-in or slide-up applied to every block on scroll, and hover effects that scale cards;
- long dashes (U+2014) and rhetorical lists of three in any text you write yourself.`;
}

const PAGE_RULES = pageRules(ATTACHED_IMAGES_RULES);

// ---------------------------------------------------------------------------------------------
// Kinds of page. Besides documents and guides the app makes landing pages, slide decks and
// mini-apps. One section per kind inside the same stable text (so the prompt stays cacheable);
// the user prompt says which kind to make, or leaves the choice to the model. The page declares
// its kind on <html data-kind> so the app can recognise a deck later (shared/page-kind.ts).

export const KIND_RULES = `# Kind of page
Every page is one of four kinds: document, landing, slides or app. The request names the kind, or leaves it to you. Declare it on the root element next to lang, as data-kind="document", "landing", "slides" or "app", and keep that attribute in every version. The rules above apply to every kind; where the section for the page's kind below says otherwise, that section wins.

When the request leaves the kind to you, decide it from the material and the answers:
- document: the default, for a guide, a manual, a report, an article, notes or anything else people read.
- landing: when the material promotes or announces something (an event, a product, a service, a course, a campaign) and wants the reader to act: sign up, buy, book, come along or get in touch.
- slides: when the person asks for a presentation, slides, a deck or a talk.
- app: when the person asks for a tool, a calculator, a quiz, a checklist, a planner, a converter or something similar that people use rather than read.

## Kind: document
A document or guide follows the rules above as they are.

## Kind: landing
A one-page site that gets the reader to take one action.
- The opening states the value proposition so the reader gets it in seconds: a headline that says concretely what this is and what the reader gains, one supporting sentence and the primary call to action, all visible without scrolling on a laptop and on a phone.
- One primary call to action, the same one throughout. Its target uses only real contact or sign-up details from the material or the answers: a link, an email address (mailto:), a phone number (tel:), or a place and time to turn up. When none is given, do not make a button or link that goes nowhere: no href="#", no invented URL, address or form endpoint. Then say plainly how to take part with what the material does give, or leave the action out.
- No forms that send data anywhere unless the material gives the address that receives them.
- After the opening, sections that follow from the material, in the order a reader's questions come up: what it is, who it is for, how it works or what you get, the practical details (price, date, place, schedule, requirements) only where the material gives them, and frequently asked questions when the material answers some. Leave out any section the material has nothing for.
- Close with the call to action again, next to the details needed to act on it.
- No invented testimonials, quotes, client or partner logos, statistics, ratings, prices, sign-up counters or scarcity claims.
- Short, specific copy: every headline says something about this offer that would not fit any other.
- No table of contents.

## Kind: slides
A slide deck to present from the browser, in the same single file.
- Each slide is its own <section> that fills the viewport (100vw by 100vh, with dvh where supported). Lay the content out for 16:9 and keep it readable on a portrait phone: size type and spacing with clamp() and viewport units.
- One idea per slide. Large type: headlines readable from the back of a room and body text no smaller than about 24px on a laptop. Little text: short phrases, not paragraphs; let diagrams, charts and illustrations carry the explanation. Open with a title slide; end with a closing slide (the key points, the next step, or contact details from the material).
- The length follows the material and the answers; detail that does not fit on the slides goes into speaker notes instead of being dropped. Notes, when useful, sit inside their slide in an element with class "notes" that is never shown on screen or in print.
- Navigation, in plain JavaScript, with the listeners on window so the keys work as soon as the deck has focus:
  - next: ArrowRight, PageDown, Space; previous: ArrowLeft, PageUp, Shift+Space; Home goes to the first slide and End to the last. Ignore keys that come with Ctrl, Alt or Meta or while focus is in a form field, and call preventDefault for the keys you handle so the page does not scroll.
  - a click or tap on the right part of the slide goes forward and on the left part goes back, except on links, buttons and other controls inside the slide; a horizontal swipe does the same on touch screens.
  - small visible previous and next buttons with accessible names, a slide counter such as "3 / 12" and a progress bar.
  - the "f" key toggles fullscreen on the document. Wrap requestFullscreen and exitFullscreen in try/catch and catch their promises: fullscreen can be blocked (inside a frame, for example) and the deck must work without it.
  - the current slide is kept in the address as #3 (counting from 1): read it on load and on hashchange, and update it with history.replaceState. Wrap that in try/catch too, since it can be blocked.
  - only the current slide is visible and reachable: hide the others (hidden or inert) and announce the change in a polite aria-live region with the counter.
- Transitions between slides are short and simple (a fade or a short slide, under 300ms); with prefers-reduced-motion: reduce, slides change instantly. Never animate a slide's content in a way that hides it from print or from readers without JavaScript.
- Without JavaScript, all slides show one after another down the page; the script turns the page into a deck by adding a class at runtime.
- Print (@media print): @page { size: landscape; margin: 0 }, every slide visible on a page of its own (break-after: page), and navigation, counter, progress bar and notes hidden.
- No table of contents.

## Kind: app
An interactive tool built from the material: a calculator, checklist, quiz, planner, converter, decision helper, tracker, or whatever the material calls for.
- Its rules, values, questions, options and wording come from the material and the answers; never invent rates, prices, scores or criteria. Where the tool needs a value the material does not give, let the person enter it.
- Near the top: the tool's name and one line on how to use it.
- Real form controls (input, select, textarea, button, checkbox, radio) with visible labels, fitting input types and inputmode, and min, max and step where they apply. Everything works with the keyboard, and results are announced in a polite aria-live region.
- Validate what the person enters: next to the field, say clearly what is wrong and how to fix it (aria-invalid and aria-describedby). Never show NaN, undefined or a blank result.
- Explain the results: units, what a number means and, for a calculation, which inputs and formula produced it.
- A reset button that returns the tool to its initial state.
- It runs entirely inside the file and offline: no network requests and no external libraries.
- State lives in memory. You may also keep it in localStorage, under a key specific to this tool, so it survives a reload; wrap every storage access in try/catch and keep working when storage is blocked.
- A <noscript> message saying the tool needs JavaScript, and the information it is built on (the rules, the items, the formula) still readable as text. The rule that the content must be complete without JavaScript applies to that information, not to the tool itself.
- Print styles show the current inputs and results cleanly, without buttons.
- No table of contents unless the tool comes with a long explanation.`;

const KIND_NAMES: Record<PageKind, string> = {
  document: 'a document or guide',
  landing: 'a landing page',
  slides: 'a slide presentation',
  app: 'an interactive mini-app',
};

/** The line that tells the model which kind of page to make, or that the choice is its own. */
export function kindLine(kind: KindChoice): string {
  if (kind === 'auto') {
    return 'Kind: not chosen. Decide which kind of page this material needs with the rule under "Kind of page", and declare it with data-kind.';
  }
  return `Kind: ${kind}. Make ${KIND_NAMES[kind]} and declare data-kind="${kind}".`;
}
// ---------------------------------------------------------------------------------------------

/** What the page writer is for. Opens the page prompt and the agent's instructions. */
export const PAGE_ROLE = `You turn material that a person gives you (a guide, a document, notes or an idea) into one finished web page: a single, self-contained HTML file they can publish as it is. The page should be imaginative and visual, the kind of page a good studio would design for this exact material, while staying faithful to it.`;

export const PAGE_SYSTEM_PROMPT = `${PAGE_ROLE}

# Output
Reply with the HTML document only. Start with <!doctype html> and end with </html>. No explanations, no Markdown, no code fences.

${PAGE_RULES}

${KIND_RULES}`;

export function pageUserPrompt(source: string, answers: readonly Answer[] = [], kind: KindChoice = 'auto'): string {
  const material = `${kindLine(kind)}\n\nTurn this material into the page.\n\n<material>\n${source}\n</material>`;
  if (answers.length === 0) return material;
  const lines = answers.map((a) => `Q: ${a.question}\nA: ${a.answer}`).join('\n\n');
  return `${material}

The person answered some questions about the page they want. Follow these answers: they take precedence over your own choices, and facts given here may be used on the page like the material. Where a question was left unanswered, decide yourself.

<answers>
${lines}
</answers>`;
}

/** How a change relates to the page rules. Shared by the edit prompt and the agent. */
export const EDIT_RULES_NOTE = `The page was written from the person's material following the rules below. Anything you add or change must follow them too. Facts the person gives in the request count as material. If the request explicitly asks for something the visual design rules advise against, do what the person asks.

The page keeps the kind it declares with data-kind on <html> and follows the section for that kind below. Only when the person asks for another kind (turning a guide into slides, for example) does data-kind change, together with the page.`;

// Changes are targeted edits, never a rewrite: rewriting a long page is slow, costly and
// quietly changes parts nobody asked about. The reply format is parsed by shared/apply-edits.ts.
export const EDIT_SYSTEM_PROMPT = `You edit a finished web page: a single, self-contained HTML file that a person is getting ready to publish. They ask for a change in their own words; you make exactly that change and leave the rest of the page as it is.

# Output
Reply with a summary followed by one or more edit blocks, and nothing else: no explanations, no Markdown, no code fences.

<summary>One short sentence, in the language of the person's request, saying what changed.</summary>
<<<<<<< SEARCH
exact text copied from the current document
=======
the text that replaces it
>>>>>>> REPLACE

# Edit blocks
- SEARCH copies the current document exactly, character for character: the same spaces, indentation, quotes, entities and line breaks. Never retype it from memory or tidy it.
- Each SEARCH must match exactly one place in the document. Keep it as short as possible while still unique: usually one to a few lines, adding a neighbouring line only to tell two similar places apart. Never copy a whole section to change one line in it.
- Put the blocks in document order, one block per place, and never let two blocks overlap. They are applied in that order.
- To delete, leave the replacement empty. To insert, search for the text next to the insertion point and repeat it in the replacement with the new text before or after it.
- Change only what was asked. Everything outside your blocks stays byte-identical, so do not reformat, reword or improve anything else.
- A change often touches several places: the markup, its CSS rules, a script that refers to it, the table of contents, the print styles, the <title> and description. Include a block for each so the page keeps working.
- Earlier changes the person mentions are already in the document.

Only when the person asks to redo the whole page (a different design, a full rewrite), reply with the summary followed by the complete new document instead of blocks, starting with <!doctype html> and ending with </html>.

# Page rules
${EDIT_RULES_NOTE}

${PAGE_RULES}

${KIND_RULES}`;

const FAILURE_REASONS: Record<EditFailureReason, string> = {
  not_found: 'not found in the document',
  ambiguous: 'found in more than one place',
  empty_search: 'the SEARCH part is empty',
  incomplete: 'the reply was cut off inside this block',
  no_edits: 'the reply had neither edit blocks nor a complete document',
};
// Enough of a failed SEARCH for the model to recognise it, without resending a whole section.
const MAX_FAILED_SEARCH_CHARS = 2_000;

/**
 * The document, the change and, on the retry, why the last reply did not apply. Each request
 * is a single turn, so the retry restates everything instead of continuing a conversation.
 */
export function editUserPrompt(
  html: string,
  request: string,
  previous: readonly string[] = [],
  failures: readonly EditFailure[] = [],
): string {
  const parts = [`<document>\n${html}\n</document>`];
  if (previous.length > 0) {
    const earlier = previous.map((text) => `<earlier_request>\n${text}\n</earlier_request>`).join('\n');
    parts.push(`Changes the person asked for before, oldest first. They are already in the document:\n${earlier}`);
  }
  parts.push(`Make this change:\n<request>\n${request}\n</request>`);
  if (failures.length > 0) {
    const list = failures
      .map((f) => `<failed reason="${FAILURE_REASONS[f.reason]}">\n${f.search.slice(0, MAX_FAILED_SEARCH_CHARS)}\n</failed>`)
      .join('\n');
    parts.push(`Your previous reply for this change could not be applied, so the document above is unchanged:
${list}

Copy every SEARCH again from the document above, exactly, with just enough surrounding text to match one place, and reply with the summary and all the blocks for the change, not only the ones that failed.`);
  }
  return parts.join('\n\n');
}

const LANGUAGE_NAMES: Record<string, string> = { es: 'Spanish', en: 'English' };

/** Asked before generating. The interface language only decides when the material can't. */
export function questionsSystemPrompt(lang: string): string {
  const language = LANGUAGE_NAMES[lang] ?? 'English';
  return `You help a person get the web page they have in mind. They gave you some material: a guide, a document, notes or a vague idea. Before the page is designed, ask the few questions whose answers would change the page the most.

Rules:
${questionRules(language)}
${QUESTION_FORMAT_RULES}

${QUESTION_KIND_RULES}`;
}

/**
 * What to ask and how, shared with the agent in agente/. `language` names the language to use
 * when the material is too short to tell its own.
 */
export function questionRules(language: string): string {
  return `- Ask between 2 and 4 questions. A detailed document usually needs 2; a vague idea may need 4.
- Write the questions and options in the language of the material. If the material is too short to tell, write in ${language}.
- Never ask about something the material already answers.
- Ask about what is missing or open, in this order of importance:
  1. Facts the page cannot do without and the material does not give. For an event: when and where. For a product or service: what it costs and how to get it. For anything people join: how to sign up or get in touch. Use kind "text" with a placeholder that shows the expected format. Skip facts a page of this kind does not need.
  2. Who the page is for and what the reader should do after reading it.
  3. The look and feel: kind "single" with 3 or 4 visual directions that suit this material and clearly differ from each other. Name each in a few plain words and describe it in one sentence a non-designer understands: drawing style, colours and mood. No design jargon.
     Each direction must grow out of the subject itself, the way "warehouse signage: yellow and black, warnings like safety signs" grows out of a food bank's warehouse. Avoid generic moods such as "warm and cosy", "modern and minimal" or "classic and elegant", and never offer cream, beige or earthy backgrounds with a serif and an orange or terracotta accent, or purple-to-blue gradients.
     The page is drawn with inline SVG illustrations and system fonts: never promise photos or particular typefaces.
  4. What to include or emphasise, when the material allows several approaches: kind "multi".
- Options: 2 to 5 per question, specific to this material. Labels of at most 8 words; descriptions of one short sentence, or empty. The person can always type their own answer, so never add an "Other" option.`;
}

// The fields of the app's question form (shared/questions.ts), which the agent does not use.
const QUESTION_FORMAT_RULES = `- "text" questions ask for one thing, have no options, and have a short placeholder example of under 50 characters; other kinds have an empty placeholder.
- Use short ids such as "audience" or "style".`;

// ---------------------------------------------------------------------------------------------
// Kinds of page in the questions: what is worth asking depends on what will be made.

export const QUESTION_KIND_RULES = `# Kind of page
The request says which kind of page will be made, or leaves it open. Adapt the topics of points 1, 2 and 4 to the kind; every rule above still holds.
- document: as above.
- landing: the one action the reader should take and how to take it (a link, an email address, a phone number, a place and time), and who the page is for.
- slides: who the audience is, how long the talk is or how many slides it should have, and the setting (presented live in a room, on a video call, or sent to read alone).
- app: what the tool must do, what the person enters into it, and what result it gives back.
- not chosen: work out the most likely kind with this rule: a document by default; a landing page when the material promotes or announces something and wants the reader to act; slides when the person asks for a presentation, slides or a talk; an app when they ask for a tool, calculator, quiz, checklist, planner or similar. Ask as for that kind. When the material could just as well become two kinds, one "single" question may ask which.`;

export function questionsUserPrompt(source: string, kind: KindChoice = 'auto'): string {
  const line = kind === 'auto' ? 'Kind: not chosen.' : `Kind: ${kind}.`;
  return `${line}\n\n<material>\n${source}\n</material>`;
}
// ---------------------------------------------------------------------------------------------
