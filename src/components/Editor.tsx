import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import Link from "@tiptap/extension-link";
import { forwardRef, useImperativeHandle, useEffect } from "react";

interface EditorProps {
  content: string;
  onChange: (content: string) => void;
  placeholder?: string;
  initialContent?: string;
}

export interface EditorRef {
  focus: () => void;
  clear: () => void;
  setContent: (content: string) => void;
  moveToEnd: () => void;
}

const Editor = forwardRef<EditorRef, EditorProps>(
  ({ onChange, placeholder, initialContent }, ref) => {
    const editor = useEditor({
      extensions: [
        StarterKit.configure({
          heading: { levels: [1, 2, 3] },
        }),
        Placeholder.configure({
          placeholder: placeholder || "Start typing...",
        }),
        TaskList,
        TaskItem.configure({ nested: true }),
        Link.configure({ openOnClick: false }),
      ],
      content: initialContent || "",
      onUpdate: ({ editor }) => {
        onChange(editor.getText());
      },
      editorProps: {
        attributes: {
          class: "stik-editor",
        },
      },
    });

    // Set initial content when editor is ready and initialContent changes
    useEffect(() => {
      if (editor && initialContent && !editor.getText()) {
        editor.commands.setContent(initialContent);
      }
    }, [editor, initialContent]);

    useImperativeHandle(ref, () => ({
      focus: () => editor?.commands.focus(),
      clear: () => editor?.commands.clearContent(),
      setContent: (content: string) => editor?.commands.setContent(content),
      moveToEnd: () => editor?.commands.focus("end"),
    }));

    return <EditorContent editor={editor} className="h-full" />;
  }
);

Editor.displayName = "Editor";

export default Editor;
