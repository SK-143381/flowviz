import { useEffect, useMemo, useRef, useState } from 'react';
import { DiagramSessionService } from './application/DiagramSessionService';
import { SchemaSessionService } from './application/SchemaSessionService';
import { MockReasoningEngine } from './infrastructure/reasoning/MockReasoningEngine';
import { MockSchemaReasoningEngine } from './infrastructure/reasoning/MockSchemaReasoningEngine';
import { GeminiReasoningEngine } from './infrastructure/reasoning/GeminiReasoningEngine';
import { GeminiSchemaReasoningEngine } from './infrastructure/reasoning/GeminiSchemaReasoningEngine';
import { ElkLayoutEngine } from './infrastructure/layout/ElkLayoutEngine';
import { WebSpeechTTS } from './infrastructure/speech/WebSpeechTTS';
import { WebSpeechSTT } from './infrastructure/speech/WebSpeechSTT';
import { getGeminiApiKey, subscribeToSettings } from './infrastructure/config/settingsStore';
import { useDiagramSession } from './presentation/hooks/useDiagramSession';
import { useSchemaSession } from './presentation/hooks/useSchemaSession';
import { DiagramCanvas } from './presentation/components/DiagramCanvas';
import { ChatPane } from './presentation/components/ChatPane';
import { Toolbar } from './presentation/components/Toolbar';
import { SchemaPane } from './presentation/components/SchemaPane';
import { SettingsPanel } from './presentation/components/SettingsPanel';
import { ExpandablePane } from './presentation/components/ExpandablePane';

type PaneId = 'schema' | 'canvas' | 'chat';

/**
 * Composition root: the only place concrete infrastructure classes are named. Picks Gemini-
 * backed engines automatically once a key is saved in Settings (infrastructure/config/
 * settingsStore.ts), otherwise falls back to the offline Mock engines — nothing in
 * application/ or presentation/ knows or cares which one is active (Dependency Inversion).
 */
function useComposedSession(settingsVersion: number) {
  return useMemo(() => {
    const apiKey = getGeminiApiKey();
    const reasoningEngine = apiKey ? new GeminiReasoningEngine(apiKey) : new MockReasoningEngine();
    const schemaReasoningEngine = apiKey ? new GeminiSchemaReasoningEngine(apiKey) : new MockSchemaReasoningEngine();
    const layoutEngine = new ElkLayoutEngine();
    const tts = new WebSpeechTTS();
    const stt = new WebSpeechSTT();
    const diagramService = new DiagramSessionService(reasoningEngine, layoutEngine, tts);
    const schemaService = new SchemaSessionService(schemaReasoningEngine, tts);
    return { diagramService, schemaService, stt, usingLiveModel: Boolean(apiKey) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settingsVersion]);
}

export default function App() {
  const [settingsVersion, setSettingsVersion] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const { diagramService, schemaService, stt, usingLiveModel } = useComposedSession(settingsVersion);
  const diagramState = useDiagramSession(diagramService);
  const schemaState = useSchemaSession(schemaService);
  const svgRef = useRef<SVGSVGElement>(null);
  const [expandedPane, setExpandedPane] = useState<PaneId | null>(null);

  useEffect(() => subscribeToSettings(() => setSettingsVersion((v) => v + 1)), []);

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-header-row">
          <div>
            <h1>FlowViz — Accessible Architecture Diagrams</h1>
            <p className="app-subtitle">
              Author a database schema or describe a system out loud. Every interpretive decision is confirmed before it is
              drawn; every edit only touches the layer it targets. {usingLiveModel ? 'Using live Gemini generation.' : 'Using the offline demo engine — add a Gemini API key in Settings for live generation.'}
            </p>
          </div>
          <button type="button" onClick={() => setSettingsOpen(true)}>
            Settings
          </button>
        </div>
      </header>

      <main className={`app-main app-main--three-pane ${expandedPane ? 'app-main--pane-expanded' : ''}`}>
        <ExpandablePane
          label="Database schema panel"
          className="schema-pane-wrapper"
          isExpanded={expandedPane === 'schema'}
          isHidden={expandedPane !== null && expandedPane !== 'schema'}
          onExpand={() => setExpandedPane('schema')}
          onCollapse={() => setExpandedPane(null)}
        >
          <SchemaPane state={schemaState} service={schemaService} onGenerateDiagram={(schema) => diagramService.generateFromSchema(schema)} />
        </ExpandablePane>

        <ExpandablePane
          label="Diagram canvas panel"
          className="canvas-pane"
          isExpanded={expandedPane === 'canvas'}
          isHidden={expandedPane !== null && expandedPane !== 'canvas'}
          onExpand={() => setExpandedPane('canvas')}
          onCollapse={() => setExpandedPane(null)}
        >
          <Toolbar state={diagramState} service={diagramService} getSvgElement={() => svgRef.current} />
          <div className="canvas-frame">
            <DiagramCanvas
              graph={diagramState.graph}
              layerVisibility={diagramState.layerVisibility}
              selectedElementId={diagramState.selectedElementId}
              onSelect={(id) => diagramService.selectElement(id)}
              svgRef={svgRef}
            />
          </div>
        </ExpandablePane>

        <ExpandablePane
          label="Assistant conversation panel"
          className="chat-pane-wrapper"
          isExpanded={expandedPane === 'chat'}
          isHidden={expandedPane !== null && expandedPane !== 'chat'}
          onExpand={() => setExpandedPane('chat')}
          onCollapse={() => setExpandedPane(null)}
        >
          <ChatPane state={diagramState} service={diagramService} stt={stt} />
        </ExpandablePane>
      </main>

      <SettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}
