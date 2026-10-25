"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import { Node } from "@tiptap/core";
import type { JSONContent } from "@tiptap/core";
import { EditorContent, NodeViewWrapper, ReactNodeViewRenderer, useEditor, useEditorState } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { isAllowedPostLink } from "@/lib/posts/links";
import { getOwnerPostImageUrl, uploadPostImage } from "@/app/admin/posts/image-actions";

const ImagePreviewContext = createContext<{
  postId: string | null;
  localUrls: Map<string, string>;
} | null>(null);

function JournalImageView({ node, updateAttributes, selected }: import("@tiptap/react").NodeViewProps) {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const preview = useContext(ImagePreviewContext);
  const path = String(node.attrs.storagePath ?? "");
  const postId = preview?.postId ?? null;
  const localUrl = preview?.localUrls.get(path);
  useEffect(() => {
    let current = true;
    setSrc(null);
    setFailed(false);
    if (localUrl) {
      setSrc(localUrl);
      return () => { current = false; };
    }
    if (!postId) {
      setFailed(true);
      return () => { current = false; };
    }
    void getOwnerPostImageUrl(postId, path).then((url) => {
      if (current) setSrc(url);
      if (current && !url) setFailed(true);
    });
    return () => {
      current = false;
    };
  }, [localUrl, path, postId]);

  return (
    <NodeViewWrapper className={`journal-image-node${selected ? " is-selected" : ""}`}>
      {src ? <img src={src} alt={String(node.attrs.alt ?? "")} /> : failed ? <span role="status">Image preview unavailable. Save and reopen the post to retry.</span> : <span role="status">Loading image…</span>}
      <label>
        <span>Image description</span>
        <input
          aria-label="Image alternative text"
          maxLength={500}
          value={String(node.attrs.alt ?? "")}
          onChange={(event) => updateAttributes({ alt: event.target.value })}
        />
      </label>
    </NodeViewWrapper>
  );
}

const JournalImage = Node.create({
  name: "journalImage",
  group: "block",
  atom: true,
  selectable: true,
  draggable: true,
  addAttributes() {
    return {
      storagePath: { default: "" },
      alt: { default: "" },
    };
  },
  parseHTML() { return [{ tag: "img[data-journal-storage-path]" }]; },
  renderHTML({ HTMLAttributes }) {
    return ["img", { "data-journal-storage-path": HTMLAttributes.storagePath, alt: HTMLAttributes.alt }];
  },
  addNodeView() { return ReactNodeViewRenderer(JournalImageView); },
});

const emptyDocument: JSONContent = {
  type: "doc",
  content: [{ type: "paragraph" }],
};

const editorExtensions = [
  StarterKit.configure({
    heading: { levels: [2, 3] },
    code: false,
    codeBlock: false,
    hardBreak: false,
    trailingNode: false,
    link: {
      openOnClick: false,
      autolink: false,
      linkOnPaste: false,
      protocols: ["mailto"],
      HTMLAttributes: {
        target: null,
        rel: null,
        class: null,
      },
    },
  }),
  JournalImage,
];

function parseInitialContent(value: string): JSONContent {
  try {
    const parsed: unknown = JSON.parse(value);
    if (
      parsed &&
      typeof parsed === "object" &&
      "type" in parsed &&
      parsed.type === "doc"
    ) {
      return parsed as JSONContent;
    }
  } catch {
    // Server validation will reject malformed submitted JSON; the editor still
    // opens in an empty document so the owner can recover the post.
  }
  return emptyDocument;
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson((value as Record<string, unknown>)[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function ToolbarButton({
  label,
  active = false,
  disabled = false,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      aria-label={label}
      aria-pressed={active}
      className={`editor-tool${active ? " is-active" : ""}`}
      disabled={disabled}
      onClick={onClick}
      onMouseDown={(event) => event.preventDefault()}
      title={label}
      type="button"
    >
      {children}
    </button>
  );
}

export function TiptapEditor({
  initialContentJson,
  postId = null,
  labelId,
  descriptionId,
  invalid,
  onDirtyChange,
}: {
  initialContentJson: string;
  postId?: string | null;
  labelId: string;
  descriptionId: string;
  invalid: boolean;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const [contentJson, setContentJson] = useState(initialContentJson);
  const [linkPanelOpen, setLinkPanelOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [linkError, setLinkError] = useState<string | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const [imageStatus, setImageStatus] = useState("");
  const [uploadingImage, setUploadingImage] = useState(false);
  const [localImageUrls, setLocalImageUrls] = useState<Map<string, string>>(new Map());
  const localImageUrlsRef = useRef(localImageUrls);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    localImageUrlsRef.current = localImageUrls;
  }, [localImageUrls]);

  useEffect(() => () => {
    for (const url of localImageUrlsRef.current.values()) URL.revokeObjectURL(url);
  }, []);

  const editor = useEditor({
    extensions: editorExtensions,
    content: parseInitialContent(initialContentJson),
    immediatelyRender: false,
    editorProps: {
      attributes: {
        id: "post-content-editor",
        role: "textbox",
        "aria-multiline": "true",
        "aria-labelledby": labelId,
        "aria-describedby": descriptionId,
        "aria-invalid": String(invalid),
      },
    },
    onCreate: ({ editor: createdEditor }) => {
      const nextJson = JSON.stringify(createdEditor.getJSON());
      setContentJson(nextJson);
      onDirtyChange(
        canonicalJson(createdEditor.getJSON()) !==
          canonicalJson(parseInitialContent(initialContentJson)),
      );
    },
    onUpdate: ({ editor: updatedEditor }) => {
      const nextJson = JSON.stringify(updatedEditor.getJSON());
      setContentJson(nextJson);
      onDirtyChange(
        canonicalJson(updatedEditor.getJSON()) !==
          canonicalJson(parseInitialContent(initialContentJson)),
      );
    },
  });

  const state = useEditorState({
    editor,
    selector: ({ editor: currentEditor }) => {
      if (!currentEditor) return null;
      return {
        isEmpty: currentEditor.isEmpty,
        paragraph: currentEditor.isActive("paragraph"),
        heading2: currentEditor.isActive("heading", { level: 2 }),
        heading3: currentEditor.isActive("heading", { level: 3 }),
        bold: currentEditor.isActive("bold"),
        italic: currentEditor.isActive("italic"),
        underline: currentEditor.isActive("underline"),
        strike: currentEditor.isActive("strike"),
        bulletList: currentEditor.isActive("bulletList"),
        orderedList: currentEditor.isActive("orderedList"),
        blockquote: currentEditor.isActive("blockquote"),
        link: currentEditor.isActive("link"),
      };
    },
  });

  useEffect(() => {
    editor?.setOptions({
      editorProps: {
        attributes: {
          id: "post-content-editor",
          role: "textbox",
          "aria-multiline": "true",
          "aria-labelledby": labelId,
          "aria-describedby": descriptionId,
          "aria-invalid": String(invalid),
        },
      },
    });
  }, [descriptionId, editor, invalid, labelId]);

  function openLinkPanel() {
    setLinkError(null);
    setLinkUrl(editor?.getAttributes("link").href ?? "");
    setLinkPanelOpen(true);
  }

  function applyLink() {
    const href = linkUrl.trim();
    if (!editor) return;
    if (!isAllowedPostLink(href)) {
      setLinkError("Enter a valid http, https, or mailto link.");
      return;
    }

    editor
      .chain()
      .focus()
      .setLink({
        href,
        target: null,
        rel: null,
        class: null,
        title: null,
      })
      .run();
    setLinkPanelOpen(false);
  }

  async function uploadImage(file: File) {
    setImageError(null);
    setUploadingImage(true);
    try {
      const formData = new FormData();
      formData.set("file", file);
      const result = await uploadPostImage(formData);
      if (!result.path) {
        setImageError(result.error ?? "The image could not be uploaded.");
        return;
      }
      const previewUrl = URL.createObjectURL(file);
      setLocalImageUrls((current) => {
        const next = new Map(current);
        next.set(result.path!, previewUrl);
        return next;
      });
      editor?.chain().focus().insertContent({
        type: "journalImage",
        attrs: { storagePath: result.path, alt: "" },
      }).run();
      setImageStatus("Image uploaded and inserted. Save the post to keep it.");
    } catch {
      setImageError("The image could not be uploaded. Please try again.");
    } finally {
      setUploadingImage(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  return (
    <ImagePreviewContext.Provider value={{ postId, localUrls: localImageUrls }}>
    <div className="tiptap-editor">
      <div className="editor-toolbar" role="toolbar" aria-label="Post formatting">
        <ToolbarButton
          label="Paragraph"
          active={state?.paragraph}
          disabled={!editor}
          onClick={() => editor?.chain().focus().setParagraph().run()}
        >
          P
        </ToolbarButton>
        <ToolbarButton
          label="Heading 2"
          active={state?.heading2}
          disabled={!editor}
          onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}
        >
          H2
        </ToolbarButton>
        <ToolbarButton
          label="Heading 3"
          active={state?.heading3}
          disabled={!editor}
          onClick={() => editor?.chain().focus().toggleHeading({ level: 3 }).run()}
        >
          H3
        </ToolbarButton>
        <span className="editor-toolbar-divider" aria-hidden="true" />
        <ToolbarButton
          label="Bold"
          active={state?.bold}
          disabled={!editor}
          onClick={() => editor?.chain().focus().toggleBold().run()}
        >
          <strong>B</strong>
        </ToolbarButton>
        <ToolbarButton
          label="Italic"
          active={state?.italic}
          disabled={!editor}
          onClick={() => editor?.chain().focus().toggleItalic().run()}
        >
          <em>I</em>
        </ToolbarButton>
        <ToolbarButton
          label="Underline"
          active={state?.underline}
          disabled={!editor}
          onClick={() => editor?.chain().focus().toggleUnderline().run()}
        >
          <u>U</u>
        </ToolbarButton>
        <ToolbarButton
          label="Strikethrough"
          active={state?.strike}
          disabled={!editor}
          onClick={() => editor?.chain().focus().toggleStrike().run()}
        >
          <s>S</s>
        </ToolbarButton>
        <span className="editor-toolbar-divider" aria-hidden="true" />
        <ToolbarButton
          label="Bulleted list"
          active={state?.bulletList}
          disabled={!editor}
          onClick={() => editor?.chain().focus().toggleBulletList().run()}
        >
          • List
        </ToolbarButton>
        <ToolbarButton
          label="Numbered list"
          active={state?.orderedList}
          disabled={!editor}
          onClick={() => editor?.chain().focus().toggleOrderedList().run()}
        >
          1. List
        </ToolbarButton>
        <ToolbarButton
          label="Blockquote"
          active={state?.blockquote}
          disabled={!editor}
          onClick={() => editor?.chain().focus().toggleBlockquote().run()}
        >
          “ ”
        </ToolbarButton>
        <ToolbarButton
          label="Insert horizontal rule"
          disabled={!editor}
          onClick={() => editor?.chain().focus().setHorizontalRule().run()}
        >
          ―
        </ToolbarButton>
        <ToolbarButton
          label="Add or edit link"
          active={state?.link || linkPanelOpen}
          disabled={!editor}
          onClick={openLinkPanel}
        >
          Link
        </ToolbarButton>
        <ToolbarButton
          label="Insert image"
          disabled={!editor || uploadingImage}
          onClick={() => fileInputRef.current?.click()}
        >
          {uploadingImage ? "Uploading…" : "Image"}
        </ToolbarButton>
      </div>
      <input
        ref={fileInputRef}
        accept="image/jpeg,image/png,image/webp"
        aria-label="Choose a JPEG, PNG, or WebP image"
        className="sr-only"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          if (file) void uploadImage(file);
        }}
        type="file"
      />
      {imageError ? <p className="field-error" role="alert">{imageError}</p> : null}
      <p className="sr-only" role="status" aria-live="polite">
        {uploadingImage ? "Uploading image…" : imageStatus}
      </p>

      {linkPanelOpen ? (
        <div className="editor-link-panel" role="group" aria-label="Link settings">
          <label htmlFor="editor-link-url">Link URL</label>
          <input
            autoComplete="url"
            id="editor-link-url"
            inputMode="url"
            type="text"
            value={linkUrl}
            aria-invalid={Boolean(linkError)}
            aria-describedby={linkError ? "editor-link-error" : undefined}
            onChange={(event) => {
              setLinkUrl(event.target.value);
              setLinkError(null);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                applyLink();
              }
            }}
          />
          {linkError ? (
            <p className="field-error" id="editor-link-error" role="alert">
              {linkError}
            </p>
          ) : null}
          <button className="button-secondary" onClick={applyLink} type="button">
            Apply link
          </button>
          {state?.link ? (
            <button
              className="button-secondary"
              onClick={() => {
                editor?.chain().focus().unsetLink().run();
                setLinkPanelOpen(false);
              }}
              type="button"
            >
              Remove link
            </button>
          ) : null}
          <button
            className="button-secondary"
            onClick={() => setLinkPanelOpen(false)}
            type="button"
          >
            Cancel
          </button>
        </div>
      ) : null}

      <div className="editor-surface">
        {state?.isEmpty ? (
          <p className="editor-empty-hint" aria-hidden="true">
            Start writing here. Use the toolbar to add headings, lists, and links.
          </p>
        ) : null}
        <EditorContent editor={editor} />
      </div>
      <input name="content" type="hidden" value={contentJson} readOnly />
    </div>
    </ImagePreviewContext.Provider>
  );
}
