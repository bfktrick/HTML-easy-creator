import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { pageKindOf } from '../../shared/page-kind.ts';
import { downloadHtml } from '../generate/filename.ts';
import { useI18n } from '../i18n/I18nProvider.tsx';
import type { Version } from '../versions/versions.ts';
import { VersionsMenu } from './VersionsMenu.tsx';
import { hasRenderableBody, previewDocument, previewErrorMessage } from '../preview/preview-doc.ts';

// Scripts run (slides, mini-apps) but without allow-same-origin the page gets an
// opaque origin: it cannot read this app, its storage or call the local API.
// Popups let the guard in preview-doc.ts open the page's links in a normal tab.
const PREVIEW_SANDBOX = 'allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox';

interface PreviewPaneProps {
  /** The page being written, or else the current version (which Download saves). */
  html: string | null;
  writing: boolean;
  versions: Version[];
  currentVersionId: string | null;
  /** While a step runs, switching versions would muddle which page it works on. */
  busy: boolean;
  onSelectVersion: (id: string) => void;
}

export function PreviewPane({ html, writing, versions, currentVersionId, busy, onSelectVersion }: PreviewPaneProps) {
  const { t } = useI18n();
  const frameRef = useRef<HTMLIFrameElement>(null);
  const srcDoc = useMemo(() => (html === null ? null : previewDocument(html)), [html]);
  const [scriptError, setScriptError] = useState<string | null>(null);
  const [errorFor, setErrorFor] = useState(html);
  // A new page (or a new chunk of it) starts without errors.
  if (errorFor !== html) {
    setErrorFor(html);
    setScriptError(null);
  }
  const waitingForBody = html !== null && writing && !hasRenderableBody(html);
  // A deck says so on its <html>; then the bar offers to present it.
  const isSlides = useMemo(() => html !== null && pageKindOf(html) === 'slides', [html]);
  const presentHintId = useId();

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      // Only the preview frame may talk to us, and it can only report an error.
      const frame = frameRef.current;
      if (!frame || event.source !== frame.contentWindow) return;
      const message = previewErrorMessage(event.data);
      if (message !== null) setScriptError(message);
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  /** Fullscreen on the iframe element, from this page: the deck inside stays sandboxed and needs no permission. */
  function present() {
    const frame = frameRef.current;
    if (!frame) return;
    // Focus lets the deck's own key listeners hear the arrows straight away.
    const focusDeck = () => {
      try {
        frame.focus();
        frame.contentWindow?.focus();
      } catch {
        // Nothing to do: a click on the preview gives it focus too.
      }
    };
    try {
      if (typeof frame.requestFullscreen === 'function') {
        frame.requestFullscreen().then(focusDeck, () => {});
      }
    } catch {
      // No fullscreen here (an old browser, or a policy): presenting in the pane still works.
    }
    focusDeck();
  }

  return (
    <section className="pane preview" aria-labelledby="preview-title" aria-busy={writing}>
      <div className="pane-bar">
        <h2 id="preview-title" className="pane-label">
          {t('preview.title')}
          {writing && <span className="pane-label-state"> · {t('preview.writing')}</span>}
        </h2>
        <div className="pane-actions">
          {isSlides && (
            <>
              <span className="pane-hint" id={presentHintId}>
                {t('preview.presentHint')}
              </span>
              <button
                type="button"
                className="button"
                aria-describedby={presentHintId}
                disabled={writing}
                onClick={present}
              >
                {t('preview.present')}
              </button>
            </>
          )}
          <VersionsMenu versions={versions} currentId={currentVersionId} disabled={busy} onSelect={onSelectVersion} />
          <button
            type="button"
            className="button primary"
            disabled={html === null || writing}
            onClick={() => html && downloadHtml(html)}
          >
            {t('preview.download')}
          </button>
        </div>
      </div>

      {scriptError !== null && !writing && (
        <p className="preview-notice" role="status" title={scriptError}>
          {t('preview.scriptError', { message: scriptError })}
        </p>
      )}

      <div className="preview-stage">
        {srcDoc !== null && !waitingForBody ? (
          <iframe
            ref={frameRef}
            className="preview-frame"
            title={t('preview.frameTitle')}
            sandbox={PREVIEW_SANDBOX}
            // A deck's own "f" key may go full screen too; browsers still require a key press or click.
            allow="fullscreen"
            referrerPolicy="no-referrer"
            srcDoc={srcDoc}
          />
        ) : (
          <div className="preview-empty">
            <p>{t(waitingForBody ? 'preview.waitingBody' : 'preview.empty')}</p>
          </div>
        )}
      </div>
    </section>
  );
}
