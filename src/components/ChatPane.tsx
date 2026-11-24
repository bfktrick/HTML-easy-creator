import {
  useEffect,
  useRef,
  useState,
  type ClipboardEvent,
  type DragEvent,
  type FormEvent,
  type KeyboardEvent,
} from 'react';
import type { KindChoice, PageKind } from '../../shared/page-kind.ts';
import type { Answer } from '../../shared/questions.ts';
import { ACCEPTED_FILES } from '../attachments/files.ts';
import { useAttachments, type OutgoingFiles } from '../attachments/useAttachments.ts';
import type { ChatMessage } from '../chat/types.ts';
import { formatElapsed, type GeneratorPhase } from '../generate/useGenerator.ts';
import { useI18n } from '../i18n/I18nProvider.tsx';
import type { MessageKey } from '../i18n/messages.ts';
import { useSettings } from '../settings/SettingsProvider.tsx';
import { AttachmentChips } from './AttachmentChips.tsx';
import { KindSelector } from './KindSelector.tsx';
import { NewPageButton } from './NewPageButton.tsx';
import { QuestionsCard } from './QuestionsCard.tsx';

// The welcome list doubles as a shortcut: each entry picks its kind in the selector.
const KINDS: { kind: PageKind; key: MessageKey }[] = [
  { kind: 'document', key: 'kind.document' },
  { kind: 'landing', key: 'kind.landing' },
  { kind: 'slides', key: 'kind.slides' },
  { kind: 'app', key: 'kind.miniapp' },
];
// Long pasted guides are shown shortened in the chat; the AI still gets all of it.
const PREVIEW_CHARS = 600;

function carriesFiles(event: { dataTransfer: DataTransfer | null }): boolean {
  return Array.from(event.dataTransfer?.types ?? []).includes('Files');
}

interface ChatPaneProps {
  messages: ChatMessage[];
  phase: GeneratorPhase;
  chars: number;
  startedAt: number | null;
  /** With a page, what is sent is a change to it. */
  hasPage: boolean;
  currentVersionId: string | null;
  awaitingAnswers: boolean;
  /** The kind of the next page; a page that exists keeps its own. */
  kind: KindChoice;
  onKindChange: (kind: KindChoice) => void;
  /** text may be "" when the message is only files. */
  onSend: (text: string, files: OutgoingFiles) => void;
  onAnswer: (id: number, source: string, answers: Answer[] | null) => void;
  onCancel: () => void;
  onOpenSettings: () => void;
  /** Makes this version current again. */
  onUndo: (versionId: string) => void;
  onStartOver: () => void;
}

export function ChatPane(props: ChatPaneProps) {
  const { messages, phase, chars, startedAt, hasPage, currentVersionId, awaitingAnswers, kind } = props;
  const { onKindChange, onSend, onAnswer, onCancel, onOpenSettings, onUndo, onStartOver } = props;
  const { lang, t } = useI18n();
  const { settings } = useSettings();
  const [draft, setDraft] = useState('');
  const [now, setNow] = useState(() => Date.now());
  const logRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const attachments = useAttachments();
  const [dragging, setDragging] = useState(false);
  const connected = Boolean(settings?.activeProvider);
  const busy = phase !== 'idle';
  // Files are material for a new page; a change to a page is always words.
  const hasFiles = !hasPage && attachments.files.length > 0;
  const canSend =
    connected && !busy && !awaitingAnswers && !attachments.pending && (draft.trim() !== '' || hasFiles);
  const elapsed = formatElapsed(startedAt === null ? 0 : now - startedAt);

  // A file dropped outside the chat would make the browser open it in place of the app.
  useEffect(() => {
    const guard = (event: globalThis.DragEvent) => {
      if (carriesFiles(event)) event.preventDefault();
    };
    window.addEventListener('dragover', guard);
    window.addEventListener('drop', guard);
    return () => {
      window.removeEventListener('dragover', guard);
      window.removeEventListener('drop', guard);
    };
  }, []);

  // A page can take minutes: a running clock shows it has not stalled.
  useEffect(() => {
    if (!busy) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [busy]);

  useEffect(() => {
    const log = logRef.current;
    if (log) log.scrollTop = log.scrollHeight;
  }, [messages.length, phase]);

  function send() {
    if (!canSend) return;
    onSend(draft, attachments.take());
    setDraft('');
  }

  function addFiles(files: File[]) {
    if (files.length === 0) return;
    if (hasPage) attachments.reject('attach.error.afterPage');
    else attachments.add(files);
  }

  function handlePaste(event: ClipboardEvent<HTMLTextAreaElement>) {
    // Text wins: copying from Word or a web page also puts a picture of it on the clipboard.
    if (event.clipboardData.types.includes('text/plain')) return;
    const images = Array.from(event.clipboardData.files).filter((file) => file.type.startsWith('image/'));
    if (images.length === 0) return;
    event.preventDefault();
    addFiles(images);
  }

  function handleDragOver(event: DragEvent<HTMLElement>) {
    if (!carriesFiles(event)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    setDragging(true);
  }

  function handleDragLeave(event: DragEvent<HTMLElement>) {
    const next = event.relatedTarget;
    if (!(next instanceof Node && event.currentTarget.contains(next))) setDragging(false);
  }

  function handleDrop(event: DragEvent<HTMLElement>) {
    if (!carriesFiles(event)) return;
    event.preventDefault();
    setDragging(false);
    addFiles(Array.from(event.dataTransfer.files));
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    send();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      send();
    }
  }

  function pickKind(next: PageKind) {
    onKindChange(next);
    // Picking a kind is the first step of a page; the next one is pasting the material.
    inputRef.current?.focus();
  }

  function startOver() {
    onStartOver();
    // The button disappears with the chat it cleared; the next step is typing.
    inputRef.current?.focus();
  }

  function progressText(): string {
    if (phase === 'reading') return t('source.reading');
    if (phase === 'asking') return t('gen.asking', { time: elapsed });
    if (phase === 'thinking') return t('gen.thinking', { time: elapsed });
    if (phase === 'editing') {
      return chars === 0
        ? t('gen.editThinking', { time: elapsed })
        : t('gen.editWriting', { n: chars.toLocaleString(lang), time: elapsed });
    }
    return t('gen.writing', { kb: Math.max(1, Math.round(chars / 1024)).toLocaleString(lang), time: elapsed });
  }

  function hint(): string {
    if (awaitingAnswers) return t('composer.answerFirst');
    if (attachments.pending) return t('composer.readingFiles');
    return hasPage ? t('composer.editHint') : t('composer.sendHint');
  }

  return (
    <section
      className="pane chat"
      aria-labelledby="chat-title"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {dragging && !hasPage && (
        <div className="drop-overlay" aria-hidden="true">
          <p>{t('attach.dropHere')}</p>
        </div>
      )}
      <div className="pane-bar">
        <h2 id="chat-title" className="pane-label">
          {t('chat.title')}
        </h2>
        {(hasPage || messages.length > 0) && (
          <NewPageButton confirm={hasPage} disabled={busy} onStartOver={startOver} />
        )}
      </div>

      <div className="chat-log" ref={logRef}>
        {messages.length === 0 && (
          <div className="intro">
            <p className="intro-lead">{t('chat.intro.lead')}</p>
            <p className="intro-body">{t('chat.intro.body')}</p>
            <p className="intro-kinds-label">{t('chat.intro.kinds')}</p>
            <ol className="kinds">
              {KINDS.map((item, index) => (
                <li key={item.kind}>
                  <button type="button" className="kinds-button" onClick={() => pickKind(item.kind)}>
                    <span className="kinds-index">{String(index + 1).padStart(2, '0')}</span>
                    {t(item.key)}
                  </button>
                </li>
              ))}
            </ol>
          </div>
        )}

        {messages.map((message) => (
          <div
            key={message.id}
            className="message"
            data-role={message.role}
            data-tone={message.role === 'app' && message.kind === 'note' ? message.tone : undefined}
          >
            <p className="message-author">{message.role === 'user' ? t('chat.you') : t('chat.app')}</p>
            {message.role === 'user' ? (
              <>
                {message.text !== '' && (
                  <p className="message-text">
                    {message.text.length > PREVIEW_CHARS ? `${message.text.slice(0, PREVIEW_CHARS)}…` : message.text}
                  </p>
                )}
                {message.text.length > PREVIEW_CHARS && (
                  <p className="message-meta">{t('chat.chars', { n: message.text.length.toLocaleString(lang) })}</p>
                )}
                {message.attachments && <AttachmentChips files={message.attachments} />}
              </>
            ) : message.kind === 'note' ? (
              <p className="message-text" role="status">
                {t(message.key, message.params)}
              </p>
            ) : message.kind === 'edit' ? (
              <>
                <p className="message-text">
                  <span role="status">
                    {message.summary ? t('edit.applied', { summary: message.summary }) : t('edit.appliedPlain')}
                  </span>
                  {/* Undo only makes sense while this change is the page on screen. */}
                  {currentVersionId === message.versionId && (
                    <>
                      {' '}
                      <button
                        type="button"
                        className="link-button"
                        disabled={busy}
                        onClick={() => onUndo(message.previousId)}
                      >
                        {t('edit.undo')}
                      </button>
                    </>
                  )}
                </p>
                {currentVersionId === message.previousId && <p className="message-meta">{t('edit.undone')}</p>}
              </>
            ) : (
              <QuestionsCard
                questions={message.questions}
                state={message.state}
                answers={message.answers}
                onSubmit={(answers) => onAnswer(message.id, message.source, answers)}
                onSkip={() => onAnswer(message.id, message.source, null)}
              />
            )}
          </div>
        ))}

        {busy && (
          <div className="message progress" data-role="app">
            <p className="message-author">{t('chat.app')}</p>
            <div className="progress-row">
              <p className="message-text" role="status">
                {progressText()}
              </p>
              <button type="button" className="button" onClick={onCancel}>
                {t('gen.cancel')}
              </button>
            </div>
          </div>
        )}
      </div>

      <form className="composer" onSubmit={handleSubmit}>
        <label htmlFor="composer-input" className="visually-hidden">
          {t('composer.label')}
        </label>
        {/* A change keeps the kind of the page it changes, so the choice only shows for a new page. */}
        {!hasPage && <KindSelector value={kind} disabled={busy || awaitingAnswers} onChange={onKindChange} />}
        {hasFiles && <AttachmentChips files={attachments.files} onRemove={attachments.remove} />}
        <textarea
          ref={inputRef}
          id="composer-input"
          rows={4}
          value={draft}
          placeholder={hasPage ? t('composer.editPlaceholder') : t('composer.placeholder')}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
        />
        {attachments.error && (
          <p className="composer-error" role="alert">
            {t(attachments.error.key, attachments.error.vars)}
          </p>
        )}
        <div className="composer-foot">
          {!hasPage && (
            <>
              {/* The button opens the picker; the input itself stays out of the tab order. */}
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept={ACCEPTED_FILES}
                className="visually-hidden"
                tabIndex={-1}
                aria-hidden="true"
                onChange={(event) => {
                  addFiles(Array.from(event.target.files ?? []));
                  event.target.value = '';
                }}
              />
              <button type="button" className="button" onClick={() => fileInputRef.current?.click()}>
                {t('composer.attach')}
              </button>
            </>
          )}
          {settings && !connected && (
            <span className="composer-hint">
              {t('composer.noProvider')}{' '}
              <button type="button" className="link-button" onClick={onOpenSettings}>
                {t('composer.connect')}
              </button>
            </span>
          )}
          {connected && <span className="composer-hint">{hint()}</span>}
          <button type="submit" className="button primary" disabled={!canSend}>
            {t('composer.send')}
          </button>
        </div>
      </form>
    </section>
  );
}
