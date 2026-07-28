import { useRef } from 'react';

interface Props {
  onLoaded: (text: string, filename: string) => void;
  label?: string;
}

/** Reusable .txt/.md upload button — reads the file client-side, hands the raw text up. */
export function DocumentUpload({ onLoaded, label = 'Upload notes' }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => onLoaded(String(reader.result ?? ''), file.name);
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept=".txt,.md,.markdown,text/plain,text/markdown"
        onChange={handleChange}
        className="visually-hidden"
        id={`doc-upload-${label.replace(/\s+/g, '-')}`}
      />
      <label htmlFor={`doc-upload-${label.replace(/\s+/g, '-')}`} className="button-like">
        {label}
      </label>
    </>
  );
}
