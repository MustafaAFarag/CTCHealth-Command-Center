"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { EditorContent, useEditor, useEditorState, type JSONContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Bold, Heading2, Italic, List, ListOrdered } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { saveNotes } from "@/lib/actions/notes";
import { cn } from "@/lib/utils";

const AUTOSAVE_DELAY_MS = 1500;

type SaveState = "saved" | "dirty" | "saving" | "error" | "conflict";

export type NotesTabHandle = {
  flush: () => Promise<void>;
};

function parseNotesContent(notes: string | null): JSONContent {
  if (notes) {
    try {
      const parsed = JSON.parse(notes);
      if (parsed && typeof parsed === "object" && parsed.type === "doc") {
        return parsed as JSONContent;
      }
    } catch {
      // Pre-existing notes may be plain text (from the Details tab textarea) —
      // fall back to wrapping it as a single paragraph instead of crashing the editor.
    }
  }
  return {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: notes ? [{ type: "text", text: notes }] : [],
      },
    ],
  };
}

type NotesTabProps = {
  projectId: string;
  version: number;
  notes: string | null;
};

export const NotesTab = forwardRef<NotesTabHandle, NotesTabProps>(function NotesTab(
  { projectId, version, notes },
  ref,
) {
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const versionRef = useRef(version);
  const conflictRef = useRef(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const revisionRef = useRef(0);
  const savedRevisionRef = useRef(0);
  const queuedRevisionRef = useRef(0);
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const mountedRef = useRef(true);

  const initialContent = useMemo(() => parseNotesContent(notes), [notes]);
  const latestContentRef = useRef(JSON.stringify(initialContent));

  const updateSaveState = useCallback((state: SaveState) => {
    if (mountedRef.current) {
      setSaveState(state);
    }
  }, []);

  const flushLatest = useCallback((): Promise<void> => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    const targetRevision = revisionRef.current;
    if (
      conflictRef.current ||
      targetRevision <= savedRevisionRef.current ||
      targetRevision <= queuedRevisionRef.current
    ) {
      return saveQueueRef.current;
    }

    const notesJson = latestContentRef.current;
    queuedRevisionRef.current = targetRevision;
    updateSaveState("saving");

    const queuedSave = saveQueueRef.current.then(async () => {
      if (conflictRef.current) {
        return;
      }

      try {
        const result = await saveNotes(
          projectId,
          versionRef.current,
          notesJson,
        );

        if (!result.ok) {
          if (result.code === "CONFLICT") {
            conflictRef.current = true;
            updateSaveState("conflict");
          } else {
            if (queuedRevisionRef.current === targetRevision) {
              queuedRevisionRef.current = savedRevisionRef.current;
            }
            updateSaveState("error");
          }
          toast.error(result.error);
          return;
        }

        versionRef.current = result.data.version;
        savedRevisionRef.current = Math.max(
          savedRevisionRef.current,
          targetRevision,
        );
        updateSaveState(
          revisionRef.current > savedRevisionRef.current ? "dirty" : "saved",
        );
      } catch {
        if (queuedRevisionRef.current === targetRevision) {
          queuedRevisionRef.current = savedRevisionRef.current;
        }
        updateSaveState("error");
        toast.error("Could not save notes. Retry before leaving this project.");
      }
    });

    saveQueueRef.current = queuedSave;
    return queuedSave;
  }, [projectId, updateSaveState]);

  useImperativeHandle(ref, () => ({ flush: flushLatest }), [flushLatest]);

  const editor = useEditor({
    extensions: [StarterKit],
    content: initialContent,
    immediatelyRender: false,
    onUpdate: ({ editor }) => {
      if (conflictRef.current) return;
      latestContentRef.current = JSON.stringify(editor.getJSON());
      revisionRef.current += 1;
      setSaveState("dirty");
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      timeoutRef.current = setTimeout(() => {
        void flushLatest();
      }, AUTOSAVE_DELAY_MS);
    },
  });

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      void flushLatest();
    };
  }, [flushLatest]);

  // On the project detail page this component stays mounted while other
  // actions (details save, archive, milestones) bump project.version — adopt
  // newer versions from props or the next autosave false-CONFLICTs.
  useEffect(() => {
    if (version > versionRef.current) {
      versionRef.current = version;
    }
  }, [version]);

  const activeMarks = useEditorState({
    editor,
    selector: (ctx) =>
      ctx.editor
        ? {
            bold: ctx.editor.isActive("bold"),
            italic: ctx.editor.isActive("italic"),
            heading: ctx.editor.isActive("heading", { level: 2 }),
            bulletList: ctx.editor.isActive("bulletList"),
            orderedList: ctx.editor.isActive("orderedList"),
          }
        : null,
  });

  const isConflict = saveState === "conflict";
  const saveLabel = {
    saved: "Saved",
    dirty: "Not saved",
    saving: "Saving…",
    error: "Not saved — retry",
    conflict: "Conflict — reload",
  }[saveState];

  const toolbarButtons = [
    {
      key: "bold",
      label: "Bold",
      icon: Bold,
      active: activeMarks?.bold,
      onClick: () => editor?.chain().focus().toggleBold().run(),
    },
    {
      key: "italic",
      label: "Italic",
      icon: Italic,
      active: activeMarks?.italic,
      onClick: () => editor?.chain().focus().toggleItalic().run(),
    },
    {
      key: "heading",
      label: "Heading",
      icon: Heading2,
      active: activeMarks?.heading,
      onClick: () => editor?.chain().focus().toggleHeading({ level: 2 }).run(),
    },
    {
      key: "bulletList",
      label: "Bullet list",
      icon: List,
      active: activeMarks?.bulletList,
      onClick: () => editor?.chain().focus().toggleBulletList().run(),
    },
    {
      key: "orderedList",
      label: "Ordered list",
      icon: ListOrdered,
      active: activeMarks?.orderedList,
      onClick: () => editor?.chain().focus().toggleOrderedList().run(),
    },
  ] as const;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-2 border-b px-4 py-2">
        <div className="flex items-center gap-1">
          {toolbarButtons.map(({ key, label, icon: Icon, active, onClick }) => (
            <Button
              key={key}
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={label}
              aria-pressed={active}
              disabled={!editor || isConflict}
              className={cn(active && "bg-muted text-foreground")}
              onClick={onClick}
            >
              <Icon />
            </Button>
          ))}
        </div>
        {saveState === "error" ? (
          <button
            type="button"
            className="text-xs text-destructive underline-offset-2 hover:underline"
            onClick={() => void flushLatest()}
          >
            {saveLabel}
          </button>
        ) : (
          <span
            aria-live="polite"
            className={cn(
              "text-xs",
              saveState === "conflict"
                ? "text-destructive"
                : "text-muted-foreground",
            )}
          >
            {saveLabel}
          </span>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        <EditorContent
          editor={editor}
          className={cn(
            "h-full text-sm",
            "[&_.ProseMirror]:h-full [&_.ProseMirror]:min-h-full [&_.ProseMirror]:outline-none",
            "[&_.ProseMirror_h2]:mt-2 [&_.ProseMirror_h2]:mb-1 [&_.ProseMirror_h2]:text-base [&_.ProseMirror_h2]:font-semibold",
            "[&_.ProseMirror_p]:my-1",
            "[&_.ProseMirror_ul]:my-1 [&_.ProseMirror_ul]:list-disc [&_.ProseMirror_ul]:pl-5",
            "[&_.ProseMirror_ol]:my-1 [&_.ProseMirror_ol]:list-decimal [&_.ProseMirror_ol]:pl-5",
          )}
        />
      </div>
    </div>
  );
});
