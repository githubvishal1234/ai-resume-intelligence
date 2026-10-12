import { UploadCloud } from "lucide-react";
import { useId, useRef, useState, type DragEvent } from "react";
import { cn } from "@/lib/cn";

const ACCEPT = ".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain";

export function FileDrop({
  onFile,
  disabled,
  label = "Resume file",
  prompt = "Drop your resume here, or choose a file",
}: {
  onFile: (file: File) => void;
  disabled?: boolean;
  label?: string;
  prompt?: string;
}) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  function onDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setOver(false);
    const file = event.dataTransfer.files[0];
    if (file && !disabled) onFile(file);
  }

  return (
    <label
      htmlFor={id}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={onDrop}
      className={cn(
        "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-card border-2 border-dashed px-6 py-12 text-center transition-colors",
        over ? "border-primary bg-primary-fixed/40" : "border-hairline-strong bg-surface-container-lowest hover:border-primary",
        disabled && "pointer-events-none opacity-60",
      )}
    >
      <UploadCloud className="size-8 text-primary" aria-hidden />
      <span className="text-label-md text-on-surface">{prompt}</span>
      <span className="text-body-sm text-on-surface-variant">PDF, DOCX or TXT · up to 10 MB · 10 pages</span>
      <input
        ref={input}
        id={id}
        type="file"
        accept={ACCEPT}
        className="sr-only"
        disabled={disabled}
        aria-label={label}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onFile(file);
          if (input.current) input.current.value = "";
        }}
      />
    </label>
  );
}
