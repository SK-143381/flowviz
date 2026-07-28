/**
 * Export utilities shared by every pane that has an "Export image" button (DiagramCanvas via
 * Toolbar, SchemaPane). Two entry points:
 *   - exportSvgElement: the diagram canvas is already an <svg>, so PNG/JPEG go through a
 *     serialize -> rasterize -> canvas.toDataURL round trip; SVG is a direct download.
 *   - exportHtmlElementAsImage: the schema pane is HTML (a table grid), so it's wrapped in an
 *     <svg><foreignObject> shell first, then goes through the same rasterization path.
 * One shared raster pipeline, two ways to get an element into SVG form first.
 */

export type ExportFormat = 'png' | 'jpeg' | 'svg';

function triggerDownload(url: string, filename: string) {
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function serializeSvg(svgEl: SVGSVGElement): string {
  const clone = svgEl.cloneNode(true) as SVGSVGElement;
  if (!clone.getAttribute('xmlns')) clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  const bbox = svgEl.viewBox.baseVal;
  const width = bbox && bbox.width ? bbox.width : svgEl.clientWidth || 1000;
  const height = bbox && bbox.height ? bbox.height : svgEl.clientHeight || 600;
  clone.setAttribute('width', String(width));
  clone.setAttribute('height', String(height));
  return new XMLSerializer().serializeToString(clone);
}

async function rasterize(svgMarkup: string, format: 'png' | 'jpeg', width: number, height: number): Promise<string> {
  const svgBlob = new Blob([svgMarkup], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(svgBlob);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = url;
    });
    const canvas = document.createElement('canvas');
    const scale = 2; // 2x for a crisper raster export
    canvas.width = width * scale;
    canvas.height = height * scale;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context unavailable.');
    if (format === 'jpeg') {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    ctx.scale(scale, scale);
    ctx.drawImage(image, 0, 0, width, height);
    return canvas.toDataURL(format === 'jpeg' ? 'image/jpeg' : 'image/png', 0.95);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function exportSvgElement(svgEl: SVGSVGElement, format: ExportFormat, filenamePrefix: string): Promise<void> {
  const markup = serializeSvg(svgEl);
  if (format === 'svg') {
    const blob = new Blob([markup], { type: 'image/svg+xml' });
    triggerDownload(URL.createObjectURL(blob), `${filenamePrefix}.svg`);
    return;
  }
  const bbox = svgEl.viewBox.baseVal;
  const width = bbox && bbox.width ? bbox.width : svgEl.clientWidth || 1000;
  const height = bbox && bbox.height ? bbox.height : svgEl.clientHeight || 600;
  const dataUrl = await rasterize(markup, format, width, height);
  triggerDownload(dataUrl, `${filenamePrefix}.${format === 'jpeg' ? 'jpg' : 'png'}`);
}

export async function exportHtmlElementAsImage(htmlEl: HTMLElement, format: ExportFormat, filenamePrefix: string): Promise<void> {
  const rect = htmlEl.getBoundingClientRect();
  const width = Math.ceil(rect.width) || 800;
  const height = Math.ceil(rect.height) || 600;
  const cssText = Array.from(document.styleSheets)
    .flatMap((sheet) => {
      try {
        return Array.from(sheet.cssRules).map((r) => r.cssText);
      } catch {
        return [];
      }
    })
    .join('\n');

  const markup = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <foreignObject width="100%" height="100%">
      <div xmlns="http://www.w3.org/1999/xhtml">
        <style>${cssText}</style>
        ${htmlEl.outerHTML}
      </div>
    </foreignObject>
  </svg>`;

  if (format === 'svg') {
    const blob = new Blob([markup], { type: 'image/svg+xml' });
    triggerDownload(URL.createObjectURL(blob), `${filenamePrefix}.svg`);
    return;
  }
  const dataUrl = await rasterize(markup, format, width, height);
  triggerDownload(dataUrl, `${filenamePrefix}.${format === 'jpeg' ? 'jpg' : 'png'}`);
}
