import type { ModelAttachment } from '../../shared/attachments.ts';
import type { Answer, Question } from '../../shared/questions.ts';
import type { AttachmentChip } from '../attachments/files.ts';
import type { MessageKey } from '../i18n/messages.ts';

export type ChatMessage =
  /** text may be "" when the message is only files. */
  | { id: number; role: 'user'; text: string; attachments?: AttachmentChip[] }
  /** Stores a key, not text, so it follows the language switch. */
  | { id: number; role: 'app'; kind: 'note'; key: MessageKey; params?: Record<string, string>; tone?: 'warning' }
  /** A change that was applied; "Undo" goes back to the version it was made from. */
  | { id: number; role: 'app'; kind: 'edit'; summary: string; versionId: string; previousId: string }
  | {
      id: number;
      role: 'app';
      kind: 'questions';
      /** The material the questions are about; generation uses it once they are answered. */
      source: string;
      /** The PDFs and images sent with the material; generation sends them again. */
      attachments: ModelAttachment[];
      questions: Question[];
      state: 'open' | 'answered' | 'skipped';
      answers: Answer[];
    };

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
export type NewChatMessage = DistributiveOmit<ChatMessage, 'id'>;
