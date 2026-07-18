import { useState } from 'react';
import { exportHtmlElementAsImage, exportSvgElement, type ExportFormat } from '../export/exportImage';

interface Props {
  kind: 'svg' | 'html';
  getElement: () => SVGSVGElement | HTMLElement | null;
  filenamePrefix: string;
  disabled?: boolean;
  label?: string;
}

/** Reusable "Export PNG / JPEG / SVG" control — used by both the diagram canvas and the schema pane. */
export function ExportMenu({ kind, getElement, filenamePrefix, disabled, label = 'Export' }: Props) {
  const [busy, setBusy] = useState<ExportFormat | null>(null);

  const handleExport = async (format: ExportFormat) => {
    const el = getElement();
    if (!el) return;
    setBusy(format);
    try {
      if (kind === 'svg') await exportSvgElement(el as SVGSVGElement, format, filenamePrefix);
      else await exportHtmlElementAsImage(el as HTMLElement, format, filenamePrefix);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="export-menu" role="group" aria-label={`${label} options`}>
      <span className="export-menu-label">{label}:</span>
      {(['png', 'jpeg', 'svg'] as const).map((format) => (
        <button key={format} type="button" onClick={() => handleExport(format)} disabled={disabled || busy !== null}>
          {busy === format ? '…' : format.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
