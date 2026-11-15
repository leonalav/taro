import * as React from "react";
import type { LayoutAnnotation, SkeletalLayerData } from "@/data/mock";
import { type Stage } from "@/lib/layout-designer";

export type DesignerDocument = { layers: SkeletalLayerData[]; annotations: LayoutAnnotation[]; stage: Stage };
type History = { current: DesignerDocument; past: DesignerDocument[]; future: DesignerDocument[] };
type Action = { type: "reset" | "commit" | "preview" | "finish"; value: DesignerDocument } | { type: "undo" | "redo" };
function reducer(state: History, action: Action): History {
  if (action.type === "reset") return { current: action.value, past: [], future: [] };
  if (action.type === "preview") return { ...state, current: action.value };
  if (action.type === "commit" || action.type === "finish") {
    const before = action.type === "finish" ? action.value : state.current;
    const after = action.type === "finish" ? state.current : action.value;
    if (JSON.stringify(before) === JSON.stringify(after)) return state;
    return { current: after, past: [...state.past.slice(-79), before], future: [] };
  }
  if (action.type === "undo" && state.past.length) return { current: state.past.at(-1)!, past: state.past.slice(0, -1), future: [state.current, ...state.future] };
  if (action.type === "redo" && state.future.length) return { current: state.future[0], past: [...state.past, state.current], future: state.future.slice(1) };
  return state;
}

export function useDesignerHistory(initial: () => DesignerDocument) {
  const [history, dispatch] = React.useReducer(reducer, undefined, () => ({ current: initial(), past: [], future: [] }));
  const cleanupGesture = React.useRef<(() => void) | null>(null);
  const gesture = (move: (event: PointerEvent) => void, onEnd?: () => void) => {
    cleanupGesture.current?.();
    const before = history.current;
    const finish = () => { cleanup(); dispatch({ type: "finish", value: before }); onEnd?.(); };
    const cancel = () => { cleanup(); dispatch({ type: "preview", value: before }); };
    const cleanup = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", finish); window.removeEventListener("pointercancel", cancel); cleanupGesture.current = null; };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", finish, { once: true }); window.addEventListener("pointercancel", cancel, { once: true }); cleanupGesture.current = cleanup;
  };
  React.useEffect(() => () => cleanupGesture.current?.(), []);
  return { doc: history.current, canUndo: !!history.past.length, canRedo: !!history.future.length, dispatch, gesture, cancelGesture: () => cleanupGesture.current?.(), commit: (value: DesignerDocument) => dispatch({ type: "commit", value }), preview: (value: DesignerDocument) => dispatch({ type: "preview", value }) };
}
