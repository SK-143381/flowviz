import type { DiagramSessionService } from '../../application/DiagramSessionService';
import type { SessionState } from '../../application/types';
import { ExportMenu } from './ExportMenu';

interface Props {
  state: SessionState;
  service: DiagramSessionService;
  getSvgElement: () => SVGSVGElement | null;
}

/** Independent layer toggles + export. Demonstrates that each layer is a first-class, addressable unit. */
export function Toolbar({ state, service, getSvgElement }: Props) {
  const handleExportJson = () => {
    const graph = service.exportGraph();
    const blob = new Blob([JSON.stringify(graph, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'diagram.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="toolbar" role="toolbar" aria-label="Diagram controls">
      {(['nodes', 'edges', 'labels'] as const).map((layer) => (
        <label key={layer} className="toolbar-item">
          <input type="checkbox" checked={state.layerVisibility[layer]} onChange={() => service.toggleLayer(layer)} />
          {layer[0].toUpperCase() + layer.slice(1)} layer
        </label>
      ))}
      <button type="button" onClick={() => service.describeCurrentDiagram()} disabled={state.mode !== 'ready'}>
        Describe diagram
      </button>
      <button type="button" onClick={handleExportJson} disabled={state.mode !== 'ready'}>
        Export JSON
      </button>
      <ExportMenu kind="svg" getElement={getSvgElement} filenamePrefix="architecture-diagram" disabled={state.mode !== 'ready'} label="Export image" />
    </div>
  );
}
