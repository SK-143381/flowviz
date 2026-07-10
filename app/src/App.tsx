import { useMemo } from 'react';
import { DiagramSessionService } from './application/DiagramSessionService';
import { MockReasoningEngine } from './infrastructure/reasoning/MockReasoningEngine';
import { ElkLayoutEngine } from './infrastructure/layout/ElkLayoutEngine';
import { WebSpeechTTS } from './infrastructure/speech/WebSpeechTTS';
import { WebSpeechSTT } from './infrastructure/speech/WebSpeechSTT';
import { useDiagramSession } from './presentation/hooks/useDiagramSession';
import { DiagramCanvas } from './presentation/components/DiagramCanvas';
import { ChatPane } from './presentation/components/ChatPane';
import { Toolbar } from './presentation/components/Toolbar';

/**
 * Composition root: the only place concrete infrastructure classes are named.
 * Swap MockReasoningEngine for a real Claude/GPT/Gemini-backed IReasoningEngine here —
 * nothing in application/ or presentation/ needs to change (Dependency Inversion).
 */
function useComposedSession() {
  return useMemo(() => {
    const reasoningEngine = new MockReasoningEngine();
    const layoutEngine = new ElkLayoutEngine();
    const tts = new WebSpeechTTS();
    const stt = new WebSpeechSTT();
    const service = new DiagramSessionService(reasoningEngine, layoutEngine, tts);
    return { service, stt };
  }, []);
}

export default function App() {
  const { service, stt } = useComposedSession();
  const state = useDiagramSession(service);

  return (
    <div className="app-shell">
      <header className="app-header">
        <h1>FlowViz — Accessible Architecture Diagrams</h1>
        <p className="app-subtitle">
          Describe a system out loud or in text. Every interpretive decision is confirmed before it is drawn;
          every edit only touches the layer it targets.
        </p>
      </header>

      <main className="app-main">
        <section className="canvas-pane" aria-label="Diagram canvas">
          <Toolbar state={state} service={service} />
          <div className="canvas-frame">
            <DiagramCanvas
              graph={state.graph}
              layerVisibility={state.layerVisibility}
              selectedElementId={state.selectedElementId}
              onSelect={(id) => service.selectElement(id)}
            />
          </div>
        </section>

        <section className="chat-pane-wrapper" aria-label="Assistant conversation">
          <ChatPane state={state} service={service} stt={stt} />
        </section>
      </main>
    </div>
  );
}
