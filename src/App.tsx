import { useMemo, useRef, useState } from 'react';
import type { ModelAttachment } from '../shared/attachments.ts';
import { MAX_PREVIOUS_REQUESTS } from '../shared/edit.ts';
import { MAX_SOURCE_CHARS } from '../shared/generate.ts';
import { inlineAttachments, tokenizeAttachments } from '../shared/inline-attachments.ts';
import type { Answer } from '../shared/questions.ts';
import { composeSource, imagesOf } from './attachments/files.ts';
import type { OutgoingFiles } from './attachments/useAttachments.ts';
import { useProjectImages } from './attachments/useProjectImages.ts';
import { useKindChoice } from './chat/kind-choice.ts';
import type { ChatMessage, NewChatMessage } from './chat/types.ts';
import { parseUrlMessage } from './chat/url-input.ts';
import { ChatPane } from './components/ChatPane.tsx';
import { Header } from './components/Header.tsx';
import { PreviewPane } from './components/PreviewPane.tsx';
import { SettingsDialog } from './components/SettingsDialog.tsx';
import { useGenerator, type EditResult, type GenerationResult } from './generate/useGenerator.ts';
import { useI18n } from './i18n/I18nProvider.tsx';
import { errorKey, type MessageKey } from './i18n/messages.ts';
import { useVersions } from './versions/useVersions.ts';
import { pageTitle, requestsLeadingTo, versionLabel, type Version } from './versions/versions.ts';

function resultMessage(result: GenerationResult): NewChatMessage {
  if (result.kind === 'error') return { role: 'app', kind: 'note', key: errorKey(result.code), tone: 'warning' };
  const keys: Record<Exclude<GenerationResult['kind'], 'error'>, MessageKey> = {
    complete: 'gen.complete',
    truncated: 'gen.truncated',
    refused: 'gen.refused',
    cancelled: 'gen.cancelled',
  };
  const tone = result.kind === 'truncated' || result.kind === 'refused' ? 'warning' : undefined;
  return { role: 'app', kind: 'note', key: keys[result.kind], tone };
}

function editFailureMessage(result: Exclude<EditResult, { kind: 'edited' }>): NewChatMessage {
  if (result.kind === 'cancelled') return { role: 'app', kind: 'note', key: 'edit.cancelled' };
  return { role: 'app', kind: 'note', key: errorKey(result.code), tone: 'warning' };
}

export function App() {
  const { lang } = useI18n();
  const generator = useGenerator();
  const versions = useVersions();
  const projectImages = useProjectImages();
  // The selector is locked while questions are open, so the answers go with the kind they were asked for.
  const [kind, setKind] = useKindChoice();
  const page = versions.current;
  // A page restored from the last visit needs a word, or the empty chat would invite a new one.
  const [messages, setMessages] = useState<ChatMessage[]>(() =>
    page ? [{ id: 0, role: 'app', kind: 'note', key: 'versions.restored' }] : [],
  );
  const [settingsOpen, setSettingsOpen] = useState(false);
  const nextId = useRef(1);
  const openSettings = () => setSettingsOpen(true);
  const awaitingAnswers = messages.some((m) => m.role === 'app' && m.kind === 'questions' && m.state === 'open');
  const writing = generator.phase === 'thinking' || generator.phase === 'writing';
  // While a page is written it shows as it grows; an edit shows only once it is applied.
  const shownHtml = (writing ? generator.draft : null) ?? page?.html ?? null;
  // Pages refer to the person's images as attachment:N; the preview and the download get the
  // images themselves, so the file works on its own.
  const previewHtml = useMemo(
    () => (shownHtml === null ? null : inlineAttachments(shownHtml, projectImages.images)),
    [shownHtml, projectImages.images],
  );

  function push(message: NewChatMessage) {
    const id = nextId.current++;
    setMessages((list) => [...list, { ...message, id } as ChatMessage]);
  }

  async function generate(source: string, answers: Answer[], attachments: ModelAttachment[]) {
    const result = await generator.start(source, answers, kind, attachments);
    // A cut-off or cancelled page stays too, as it did before versions: it can still be fixed by chat.
    if ((result.kind === 'complete' || result.kind === 'truncated' || result.kind === 'cancelled') && result.html) {
      // Versions keep attachment:N, never a copy of each image (see attachments/image-store.ts).
      const html = tokenizeAttachments(result.html, imagesOf(attachments));
      versions.add(html, pageTitle(html), 'generated');
    }
    push(resultMessage(result));
  }

  async function edit(request: string, base: Version) {
    push({ role: 'user', text: request });
    // Only the changes that are in the base version: after an undo, the undone ones are not.
    const previous = requestsLeadingTo(versions.versions, base.id, MAX_PREVIOUS_REQUESTS);
    const result = await generator.edit(base.html, request, previous);
    if (result.kind !== 'edited') return push(editFailureMessage(result));
    const label = versionLabel(result.summary || request);
    const html = tokenizeAttachments(result.html, projectImages.images);
    const versionId = versions.add(html, label, 'edited', { parentId: base.id, request });
    push({ role: 'app', kind: 'edit', summary: result.summary, versionId, previousId: base.id });
  }

  /** A message that starts with a link becomes the text of that page, plus what was written after it. */
  async function sourceFor(text: string): Promise<string | null> {
    const link = parseUrlMessage(text);
    if (!link) return text;
    const read = await generator.readUrl(link.url);
    if (read.kind === 'cancelled') {
      push({ role: 'app', kind: 'note', key: 'gen.cancelledQuestions' });
      return null;
    }
    if (read.kind === 'error') {
      push({ role: 'app', kind: 'note', key: errorKey(read.code), tone: 'warning' });
      return null;
    }
    push({ role: 'app', kind: 'note', key: 'source.read', params: { title: read.title || read.url } });
    const material = `Web page: ${read.url}
Title: ${read.title}

${read.text}`;
    // The page text already fills the limit at most; the heading and the instructions must still fit.
    return (link.rest ? `${link.rest}

${material}` : material).slice(0, MAX_SOURCE_CHARS);
  }

  // With a page, a message is a change to it (files are attached only to new pages). Otherwise
  // first a few questions; with none (or a model that cannot ask), straight to the page.
  async function handleSend(text: string, files: OutgoingFiles) {
    if (page) return edit(text, page);
    const { attachments } = files;
    // These are the images the new page's attachment:N refer to.
    projectImages.replace(imagesOf(attachments));
    push({ role: 'user', text, ...(files.chips.length > 0 ? { attachments: files.chips } : {}) });
    // A link becomes its page's text; the attached files go along with it.
    const typed = await sourceFor(text);
    if (typed === null) return;
    const source = composeSource(typed, files.documents);
    const asked = await generator.ask(source, lang, kind, attachments);
    if (asked.kind === 'questions') {
      if (asked.questions.length === 0) return generate(source, [], attachments);
      push({ role: 'app', kind: 'questions', source, attachments, questions: asked.questions, state: 'open', answers: [] });
    } else if (asked.kind === 'cancelled') {
      push({ role: 'app', kind: 'note', key: 'gen.cancelledQuestions' });
    } else {
      push({ role: 'app', kind: 'note', key: errorKey(asked.code), tone: 'warning' });
    }
  }

  /** answers is null when the person skipped the questions. */
  function handleAnswers(id: number, source: string, answers: Answer[] | null) {
    const asked = messages.find((m) => m.id === id);
    const attachments = asked?.role === 'app' && asked.kind === 'questions' ? asked.attachments : [];
    setMessages((list) =>
      list.map((m) =>
        m.id === id && m.role === 'app' && m.kind === 'questions'
          ? { ...m, state: answers ? 'answered' : 'skipped', answers: answers ?? [] }
          : m,
      ),
    );
    void generate(source, answers ?? [], attachments);
  }

  function startOver() {
    versions.reset();
    projectImages.replace([]);
    setMessages([]);
  }

  return (
    <div className="app">
      <Header onOpenSettings={openSettings} />
      <main className="workspace">
        <ChatPane
          messages={messages}
          phase={generator.phase}
          chars={generator.chars}
          startedAt={generator.startedAt}
          hasPage={page !== null}
          currentVersionId={page?.id ?? null}
          awaitingAnswers={awaitingAnswers}
          kind={kind}
          onKindChange={setKind}
          onSend={(text, files) => void handleSend(text, files)}
          onAnswer={handleAnswers}
          onCancel={generator.cancel}
          onOpenSettings={openSettings}
          onUndo={versions.select}
          onStartOver={startOver}
        />
        <PreviewPane
          html={previewHtml}
          writing={writing}
          versions={versions.versions}
          currentVersionId={page?.id ?? null}
          busy={generator.phase !== 'idle'}
          onSelectVersion={versions.select}
        />
      </main>
      <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}
