
import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { 
  Plus, 
  Trash2, 
  Settings2, 
  Server, 
  Zap, 
  Scissors, 
  Cable, 
  ArrowRight,
  Database, 
  GitBranch, 
  ChevronRight, 
  Info, 
  MoveVertical, 
  RefreshCcw, 
  GripVertical, 
  Target
} from 'lucide-react';
import { NetworkNode, NodeType, DistanceUnit } from './types';
import { 
  DEFAULT_ATTENUATION, 
  DEFAULT_CONNECTOR_LOSS, 
  DEFAULT_SPLICE_LOSS, 
  SPLITTER_LOSSES,
  UNBALANCED_SPLITTER_LOSSES
} from './constants';

const App: React.FC = () => {
  const [oltPower, setOltPower] = useState<number>(5.0);
  const [rootNode, setRootNode] = useState<NetworkNode>({
    id: 'root',
    type: NodeType.OLT,
    name: 'OLT',
    loss: 0,
    offsetY: 0,
    branches: [[]]
  });

  const [draggingNode, setDraggingNode] = useState<{ id: string; startY: number; initialOffset: number } | null>(null);
  const [insertionMenu, setInsertionMenu] = useState<{ parentId: string, branchIndex: number, insertIndex: number, x: number, y: number } | null>(null);

  const calculatePower = useCallback((node: NetworkNode, inputPower: number): NetworkNode => {
    let powerOut = inputPower - node.loss;
    
    if (node.type === NodeType.FIBER) {
      const distKm = node.unit === 'm' ? (node.length || 0) / 1000 : (node.length || 0);
      const calculatedLoss = distKm * (node.attenuationCoefficient || DEFAULT_ATTENUATION);
      powerOut = inputPower - calculatedLoss;
    }

    const calculatedBranches = node.branches?.map((branch, bIndex) => {
      let currentPower = powerOut;
      
      if (node.type === NodeType.SPLITTER_UNBALANCED && node.splitterRatio) {
        const ratios = UNBALANCED_SPLITTER_LOSSES[node.splitterRatio];
        const branchLoss = bIndex === 0 ? ratios[0] : ratios[1];
        currentPower = inputPower - branchLoss - (node.loss || 0);
      }

      return branch.map(child => {
        const updatedChild = calculatePower(child, currentPower);
        currentPower = updatedChild.powerOut!;
        return updatedChild;
      });
    });

    return { ...node, powerIn: inputPower, powerOut, branches: calculatedBranches };
  }, []);

  const tree = useMemo(() => calculatePower(rootNode, oltPower), [rootNode, oltPower]);

  const updateTree = (node: NetworkNode, id: string, updater: (n: NetworkNode) => NetworkNode): NetworkNode => {
    if (node.id === id) return updater(node);
    if (!node.branches) return node;

    return {
      ...node,
      branches: node.branches.map(branch => branch.map(child => updateTree(child, id, updater)))
    };
  };

  const createNode = (type: NodeType): NetworkNode => {
    const newId = Math.random().toString(36).substr(2, 9);
    switch (type) {
      case NodeType.FIBER:
        return { id: newId, type, name: 'Fibra', loss: DEFAULT_ATTENUATION, length: 1, unit: 'km', attenuationCoefficient: DEFAULT_ATTENUATION, offsetY: 0 };
      case NodeType.SPLITTER:
        // Alterado para 1:2 como padrão
        return { id: newId, type, name: 'Splitter', loss: SPLITTER_LOSSES['1:2'], splitterRatio: '1:2', branches: Array(2).fill(0).map(() => []), offsetY: 0 };
      case NodeType.SPLITTER_UNBALANCED:
        return { id: newId, type, name: 'CEO Desb.', loss: 0, splitterRatio: '10/90', branches: [[], []], offsetY: 0 };
      case NodeType.CONNECTOR:
        return { id: newId, type, name: 'Conector', loss: DEFAULT_CONNECTOR_LOSS, offsetY: 0 };
      case NodeType.SPLICE:
        return { id: newId, type, name: 'Fusão', loss: DEFAULT_SPLICE_LOSS, offsetY: 0 };
      default:
        return { id: newId, type, name: 'ONU', loss: 0.2, offsetY: 0 };
    }
  };

  const addElementAtPosition = (parentId: string, branchIndex: number, type: NodeType, insertIndex?: number) => {
    const newNode = createNode(type);
    setRootNode(prev => updateTree(prev, parentId, (node) => {
      const newBranches = [...(node.branches || [])];
      const targetBranch = [...newBranches[branchIndex]];
      
      if (insertIndex !== undefined) {
        targetBranch.splice(insertIndex, 0, newNode);
      } else {
        targetBranch.push(newNode);
      }
      
      newBranches[branchIndex] = targetBranch;
      return { ...node, branches: newBranches };
    }));
    setInsertionMenu(null);
  };

  const updateNodeData = (id: string, updates: Partial<NetworkNode>) => {
    setRootNode(prev => updateTree(prev, id, (node) => {
      const updated = { ...node, ...updates };
      
      if (updates.unit && updates.unit !== node.unit) {
        if (updates.unit === 'm') updated.length = (node.length || 0) * 1000;
        else updated.length = (node.length || 0) / 1000;
      }

      if (updated.type === NodeType.FIBER && (updates.length !== undefined || updates.attenuationCoefficient !== undefined || updates.unit !== undefined)) {
        const distKm = updated.unit === 'm' ? (updated.length || 0) / 1000 : (updated.length || 0);
        updated.loss = distKm * (updated.attenuationCoefficient || DEFAULT_ATTENUATION);
      }
      
      if (updated.type === NodeType.SPLITTER && updates.splitterRatio !== undefined) {
        updated.loss = SPLITTER_LOSSES[updates.splitterRatio] || 0;
        const numPorts = parseInt(updates.splitterRatio.split(':')[1]);
        if (numPorts !== node.branches?.length) {
          updated.branches = Array(numPorts).fill(0).map((_, i) => node.branches?.[i] || []);
        }
      }
      return updated;
    }));
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (draggingNode) {
        const deltaY = e.clientY - draggingNode.startY;
        updateNodeData(draggingNode.id, { offsetY: draggingNode.initialOffset + deltaY });
      }
    };

    const handleMouseUp = () => setDraggingNode(null);

    if (draggingNode) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [draggingNode]);

  const onStartDrag = (e: React.MouseEvent, node: NetworkNode) => {
    if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'SELECT' || (e.target as HTMLElement).closest('button')) {
      return;
    }
    e.preventDefault();
    setDraggingNode({ id: node.id, startY: e.clientY, initialOffset: node.offsetY || 0 });
  };

  const handleShowInsertionMenu = (e: React.MouseEvent, parentId: string, branchIndex: number, insertIndex: number) => {
    e.stopPropagation();
    setInsertionMenu({ parentId, branchIndex, insertIndex, x: e.clientX, y: e.clientY });
  };

  const InsertionMenu = () => {
    if (!insertionMenu) return null;
    return (
      <div 
        className="fixed z-[200] bg-white border border-slate-200 rounded-2xl shadow-2xl p-2 flex gap-1 animate-in fade-in zoom-in duration-200"
        style={{ left: insertionMenu.x - 100, top: insertionMenu.y - 60 }}
        onMouseLeave={() => setInsertionMenu(null)}
      >
        <button onClick={() => addElementAtPosition(insertionMenu.parentId, insertionMenu.branchIndex, NodeType.FIBER, insertionMenu.insertIndex)} className="p-2 hover:bg-blue-50 text-blue-500 rounded-xl transition-colors" title="Cabo"><Cable size={20}/></button>
        <button onClick={() => addElementAtPosition(insertionMenu.parentId, insertionMenu.branchIndex, NodeType.SPLITTER, insertionMenu.insertIndex)} className="p-2 hover:bg-amber-50 text-amber-500 rounded-xl transition-colors" title="Splitter Bal."><Zap size={20}/></button>
        <button onClick={() => addElementAtPosition(insertionMenu.parentId, insertionMenu.branchIndex, NodeType.SPLITTER_UNBALANCED, insertionMenu.insertIndex)} className="p-2 hover:bg-orange-50 text-orange-500 rounded-xl transition-colors" title="CEO Desb."><GitBranch size={20}/></button>
        <button onClick={() => addElementAtPosition(insertionMenu.parentId, insertionMenu.branchIndex, NodeType.CONNECTOR, insertionMenu.insertIndex)} className="p-2 hover:bg-emerald-50 text-emerald-500 rounded-xl transition-colors" title="Conector"><Settings2 size={20}/></button>
        <button onClick={() => addElementAtPosition(insertionMenu.parentId, insertionMenu.branchIndex, NodeType.SPLICE, insertionMenu.insertIndex)} className="p-2 hover:bg-purple-50 text-purple-500 rounded-xl transition-colors" title="Fusão"><Scissors size={20}/></button>
      </div>
    );
  };

  const NodeRenderer: React.FC<{ node: NetworkNode, parentId?: string, branchIndex?: number, nodeIndex?: number }> = ({ node, parentId, branchIndex, nodeIndex }) => {
    const getPowerColor = (p: number) => p < -28 ? 'text-red-600' : p < -25 ? 'text-amber-600' : 'text-emerald-600';
    const isThisDragging = draggingNode?.id === node.id;

    const SideInsertionButton = ({ side }: { side: 'left' | 'right' }) => {
      if (node.type === NodeType.OLT) return null;
      const insertIdx = side === 'left' ? nodeIndex! : nodeIndex! + 1;
      return (
        <button 
          onClick={(e) => handleShowInsertionMenu(e, parentId!, branchIndex!, insertIdx)}
          className={`absolute ${side === 'left' ? '-left-2' : '-right-2'} top-1/2 -translate-y-1/2 z-40 opacity-0 group-hover:opacity-100 transition-opacity bg-indigo-500 text-white rounded-full p-0.5 shadow-lg border border-white hover:scale-125 transition-transform`}
        >
          <Plus size={10} strokeWidth={4} />
        </button>
      );
    };

    const DragHandleOverlay = () => (
      <div className="absolute inset-0 z-0 cursor-grab active:cursor-grabbing rounded-xl group-hover:bg-indigo-50/10 transition-colors">
        <div className="absolute top-0.5 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-40 transition-opacity text-slate-400">
           <GripVertical size={10} className="rotate-90" />
        </div>
      </div>
    );

    const renderContent = () => {
      if (node.type === NodeType.FIBER) {
        return (
          <div className="flex items-center group relative min-h-[80px]">
            <SideInsertionButton side="left" />
            <div onMouseDown={(e) => onStartDrag(e, node)} className="w-32 h-1.5 bg-blue-400 rounded-full shadow-[0_0_12px_rgba(96,165,250,0.4)] relative cursor-grab active:cursor-grabbing">
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <div className="pointer-events-auto bg-white border border-blue-200 rounded-full px-2.5 py-0.5 shadow-sm flex items-center gap-1 -mt-10 mb-1 hover:scale-105 transition-transform border-b-2">
                  <input type="number" step="1" value={node.length} onChange={(e) => updateNodeData(node.id, { length: parseFloat(e.target.value) || 0 })} className="w-10 text-[10px] font-black text-blue-600 bg-transparent border-none focus:ring-0 p-0 text-center" />
                  <select value={node.unit} onChange={(e) => updateNodeData(node.id, { unit: e.target.value as DistanceUnit })} className="text-[9px] font-black text-blue-400 bg-transparent border-none p-0 outline-none cursor-pointer uppercase">
                    <option value="m">m</option>
                    <option value="km">km</option>
                  </select>
                </div>
                <div className="pointer-events-auto absolute top-2 bg-white/90 border border-slate-100 rounded px-1.5 py-0.5 opacity-0 group-hover:opacity-100 transition-opacity shadow-sm flex items-center gap-1">
                  <input type="number" step="0.01" value={node.attenuationCoefficient} onChange={(e) => updateNodeData(node.id, { attenuationCoefficient: parseFloat(e.target.value) || 0 })} className="w-8 text-[8px] font-bold text-slate-500 bg-transparent border-none p-0 text-center outline-none" />
                  <span className="text-[7px] text-slate-300 font-black">dB/km</span>
                </div>
              </div>
            </div>
            <SideInsertionButton side="right" />
            <button onClick={() => setRootNode(prev => {
              const filterNode = (n: NetworkNode): NetworkNode => ({...n, branches: n.branches?.map(b => b.filter(c => c.id !== node.id).map(filterNode))});
              return filterNode(prev);
            })} className="absolute -top-4 right-0 opacity-0 group-hover:opacity-100 p-1.5 text-red-300 hover:text-red-500 transition-all bg-white rounded-full border shadow-sm z-20"><Trash2 size={12} /></button>
          </div>
        );
      }

      if (node.type === NodeType.CONNECTOR) {
        return (
          <div className="flex items-center group relative px-3 min-h-[80px]">
            <SideInsertionButton side="left" />
            <div onMouseDown={(e) => onStartDrag(e, node)} className={`w-5 h-10 bg-emerald-500 rounded-sm border-2 border-emerald-600 relative flex items-center justify-center shadow-lg cursor-grab active:cursor-grabbing ${isThisDragging ? 'scale-110' : ''}`}>
               <DragHandleOverlay />
               <div className="w-1.5 h-4 bg-emerald-300 rounded-full opacity-60 pointer-events-none"></div>
               <div className="absolute -top-12 left-1/2 -translate-x-1/2 bg-white border border-emerald-100 rounded-lg px-2 py-1 opacity-0 group-hover:opacity-100 transition-opacity shadow-xl z-30 pointer-events-auto">
                  <div className="flex items-center gap-1">
                    <input type="number" step="0.05" value={node.loss} onChange={(e) => updateNodeData(node.id, { loss: parseFloat(e.target.value) || 0 })} className="w-10 text-[10px] font-black text-emerald-600 bg-transparent border-none p-0 text-center outline-none focus:ring-0" />
                    <span className="text-[8px] font-black text-emerald-300 uppercase">dB</span>
                  </div>
               </div>
            </div>
            <SideInsertionButton side="right" />
            <button onClick={() => setRootNode(prev => {
              const filterNode = (n: NetworkNode): NetworkNode => ({...n, branches: n.branches?.map(b => b.filter(c => c.id !== node.id).map(filterNode))});
              return filterNode(prev);
            })} className="absolute -top-6 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 p-1.5 text-red-400 hover:text-red-600 transition-all bg-white rounded-full border shadow-sm z-20"><Trash2 size={12} /></button>
          </div>
        );
      }

      if (node.type === NodeType.SPLICE) {
        return (
          <div className="flex items-center group relative px-3 min-h-[80px]">
            <SideInsertionButton side="left" />
            <div onMouseDown={(e) => onStartDrag(e, node)} className={`w-6 h-6 rounded-full bg-purple-500 border-2 border-purple-200 flex items-center justify-center shadow-[0_0_15px_rgba(168,85,247,0.4)] cursor-grab active:cursor-grabbing ${isThisDragging ? 'scale-110' : ''}`}>
               <DragHandleOverlay />
               <div className="w-1.5 h-1.5 bg-white rounded-full pointer-events-none"></div>
               <div className="absolute -top-12 left-1/2 -translate-x-1/2 bg-white border border-purple-100 rounded-lg px-2 py-1 opacity-0 group-hover:opacity-100 transition-opacity shadow-xl z-30 pointer-events-auto">
                  <div className="flex items-center gap-1">
                    <input type="number" step="0.01" value={node.loss} onChange={(e) => updateNodeData(node.id, { loss: parseFloat(e.target.value) || 0 })} className="w-10 text-[10px] font-black text-purple-600 bg-transparent border-none p-0 text-center outline-none focus:ring-0" />
                    <span className="text-[8px] font-black text-purple-300 uppercase">dB</span>
                  </div>
               </div>
            </div>
            <SideInsertionButton side="right" />
            <button onClick={() => setRootNode(prev => {
              const filterNode = (n: NetworkNode): NetworkNode => ({...n, branches: n.branches?.map(b => b.filter(c => c.id !== node.id).map(filterNode))});
              return filterNode(prev);
            })} className="absolute -top-6 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 p-1.5 text-red-400 hover:text-red-600 transition-all bg-white rounded-full border shadow-sm z-20"><Trash2 size={12} /></button>
          </div>
        );
      }

      if (node.type === NodeType.ONU) {
        return (
          <div onMouseDown={(e) => onStartDrag(e, node)} className="flex flex-col items-center group relative ml-4 min-h-[80px] justify-center cursor-grab active:cursor-grabbing">
             <SideInsertionButton side="left" />
             <div className={`w-14 h-10 bg-slate-100 border-2 border-slate-300 rounded-xl flex items-center justify-center relative shadow-md ${isThisDragging ? 'ring-2 ring-indigo-400' : ''}`}>
                <div className="flex gap-1.5">
                  <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse"></div>
                  <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse"></div>
                </div>
             </div>
             <div className={`mt-2.5 text-[11px] font-black px-2 py-0.5 bg-white rounded-full border shadow-sm ${getPowerColor(node.powerOut!)}`}>
               {node.powerOut?.toFixed(1)} dBm
             </div>
             <button onClick={() => setRootNode(prev => {
              const filterNode = (n: NetworkNode): NetworkNode => ({...n, branches: n.branches?.map(b => b.filter(c => c.id !== node.id).map(filterNode))});
              return filterNode(prev);
            })} className="absolute -top-8 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 p-1.5 text-red-400 hover:text-red-600 transition-all bg-white rounded-full border shadow-sm z-20"><Trash2 size={12} /></button>
          </div>
        );
      }

      if (node.type === NodeType.OLT) {
        return (
          <div className="flex items-center gap-6">
            <div onMouseDown={(e) => onStartDrag(e, node)} className="relative group cursor-grab active:cursor-grabbing">
              <div className={`w-40 h-24 bg-indigo-600 rounded-2xl shadow-2xl flex flex-col p-4 border-b-8 border-indigo-900 relative overflow-hidden ring-4 ring-indigo-100 ${isThisDragging ? 'scale-105' : ''}`}>
                <div className="absolute inset-0 bg-gradient-to-br from-white/20 to-transparent"></div>
                <div className="flex justify-between items-start z-10">
                  <Server size={22} className="text-white/90" />
                  <div className="flex gap-1.5"><div className="w-2 h-2 bg-red-400 rounded-full animate-pulse"></div><div className="w-2 h-2 bg-emerald-400 rounded-full"></div></div>
                </div>
                <div className="mt-auto z-10">
                  <div className="text-[9px] font-black text-indigo-100 uppercase tracking-widest mb-0.5">Potência Tx</div>
                  <div className="text-lg font-black text-white">{oltPower.toFixed(1)} dBm</div>
                </div>
              </div>
            </div>
            {renderBranches(node)}
          </div>
        );
      }

      return (
        <div className="flex items-center gap-6 min-h-[100px]">
          <div onMouseDown={(e) => onStartDrag(e, node)} className="relative group flex items-center cursor-grab active:cursor-grabbing">
            <SideInsertionButton side="left" />
            <div className={`w-36 bg-white border-2 rounded-2xl p-4 shadow-lg hover:shadow-2xl transition-all ${node.type === NodeType.SPLITTER ? 'border-amber-400 ring-4 ring-amber-50' : 'border-orange-500 ring-4 ring-orange-50'} ${isThisDragging ? 'scale-105 shadow-indigo-100' : ''}`}>
              <div className="flex justify-between items-center mb-3">
                <div className={`p-1.5 rounded-xl ${node.type === NodeType.SPLITTER ? 'bg-amber-100 text-amber-600' : 'bg-orange-100 text-orange-600'}`}><Zap size={18}/></div>
                <button onClick={() => setRootNode(prev => {
                  const filterNode = (n: NetworkNode): NetworkNode => ({...n, branches: n.branches?.map(b => b.filter(c => c.id !== node.id).map(filterNode))});
                  return filterNode(prev);
                })} className="text-slate-300 hover:text-red-500 transition-colors p-1 hover:bg-red-50 rounded-lg"><Trash2 size={14}/></button>
              </div>
              <div className="space-y-3">
                <select className="w-full text-[10px] font-black bg-slate-50 border-none rounded-lg p-1.5 outline-none uppercase tracking-tighter cursor-pointer hover:bg-slate-100 transition-colors" value={node.splitterRatio} onChange={(e) => updateNodeData(node.id, { splitterRatio: e.target.value })}>
                  {node.type === NodeType.SPLITTER ? Object.keys(SPLITTER_LOSSES).map(r => <option key={r} value={r}>{r}</option>) : Object.keys(UNBALANCED_SPLITTER_LOSSES).map(r => <option key={r} value={r}>{r}</option>)}
                </select>
                <div className="flex items-center justify-between border-t border-slate-50 pt-2 px-1">
                  <span className="text-[8px] font-black text-slate-400 uppercase">Perda Extra</span>
                  <div className="flex items-center gap-0.5">
                    <input type="number" step="0.1" value={node.loss} onChange={(e) => updateNodeData(node.id, { loss: parseFloat(e.target.value) || 0 })} className="w-10 text-right text-[11px] font-black bg-transparent border-none p-0 text-indigo-600 focus:ring-0" />
                    <span className="text-[8px] font-bold text-slate-300">dB</span>
                  </div>
                </div>
              </div>
            </div>
            <SideInsertionButton side="right" />
          </div>
          {renderBranches(node)}
        </div>
      );
    };

    return (
      <div style={{ transform: `translateY(${node.offsetY || 0}px)` }} className={`transition-transform duration-75 ease-out select-none ${isThisDragging ? 'z-50' : ''}`}>
        {renderContent()}
      </div>
    );
  };

  const renderBranches = (node: NetworkNode) => {
    if (!node.branches || node.branches.length === 0) return null;
    return (
      <div className="flex flex-col gap-16 relative pl-8">
        <div className="absolute left-0 top-10 bottom-10 w-0.5 bg-slate-200/60 rounded-full"></div>
        {node.branches.map((branch, bIndex) => (
          <div key={bIndex} className="flex items-center gap-0 relative">
            <div className="w-14 h-px bg-slate-200/60 shrink-0 relative flex items-center">
              <div className="absolute -left-6 top-1/2 -translate-y-1/2 text-[8px] font-black bg-white text-slate-400 w-5 h-5 rounded-full flex items-center justify-center border-2 border-slate-100 shadow-sm z-10">{bIndex + 1}</div>
              <div className="absolute -right-1 top-1/2 -translate-y-1/2 text-slate-300"><ChevronRight size={14} /></div>
            </div>
            <div className="flex items-center gap-0">
              {branch.map((child, cIdx) => (
                <NodeRenderer key={child.id} node={child} parentId={node.id} branchIndex={bIndex} nodeIndex={cIdx} />
              ))}
              <div className="ml-6 flex items-center gap-1.5 p-1.5 bg-white/90 border-2 border-dashed border-slate-200 rounded-2xl group shadow-sm hover:shadow-xl hover:border-indigo-400 transition-all h-12 hover:-translate-y-0.5">
                <button onClick={() => addElementAtPosition(node.id, bIndex, NodeType.FIBER)} className="p-2 hover:bg-blue-50 text-blue-400 hover:text-blue-600 rounded-xl transition-all"><Cable size={18}/></button>
                <button onClick={() => addElementAtPosition(node.id, bIndex, NodeType.SPLITTER)} className="p-2 hover:bg-amber-50 text-amber-400 hover:text-amber-600 rounded-xl transition-all"><Zap size={18}/></button>
                <button onClick={() => addElementAtPosition(node.id, bIndex, NodeType.SPLITTER_UNBALANCED)} className="p-2 hover:bg-orange-50 text-orange-400 hover:text-orange-600 rounded-xl transition-all"><GitBranch size={18}/></button>
                <button onClick={() => addElementAtPosition(node.id, bIndex, NodeType.CONNECTOR)} className="p-2 hover:bg-emerald-50 text-emerald-400 hover:text-emerald-600 rounded-xl transition-all"><Settings2 size={18}/></button>
                <button onClick={() => addElementAtPosition(node.id, bIndex, NodeType.SPLICE)} className="p-2 hover:bg-purple-50 text-purple-400 hover:text-purple-600 rounded-xl transition-all"><Scissors size={18}/></button>
                <button onClick={() => addElementAtPosition(node.id, bIndex, NodeType.ONU)} className="p-2 hover:bg-slate-100 text-slate-400 text-slate-600 rounded-xl transition-all"><ArrowRight size={18}/></button>
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-[#f8fafc] flex flex-col font-sans text-slate-900 overflow-hidden selection:bg-indigo-100">
      <InsertionMenu />
      <header className="bg-white/80 backdrop-blur-md border-b border-slate-200 px-10 py-5 sticky top-0 z-[100] shadow-sm">
        <div className="max-w-screen-2xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-5">
            <div className="bg-indigo-600 p-3 rounded-2xl text-white shadow-xl shadow-indigo-200 transform hover:rotate-3 transition-transform"><Database size={28} /></div>
            <div>
              <h1 className="text-2xl font-black text-slate-800 tracking-tighter leading-none">PON DIAGRAM PRO</h1>
              <div className="flex items-center gap-2 mt-1">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.4)]"></span>
                <p className="text-[11px] text-slate-400 uppercase tracking-widest font-black italic">Editor de Inserção Dinâmica v5.0</p>
              </div>
            </div>
          </div>
          <div className="bg-white border-2 border-indigo-50 rounded-[1.5rem] px-8 py-4 flex items-center gap-8 shadow-sm">
            <div className="flex flex-col">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-50 mb-1">Tx Power OLT</span>
              <div className="flex items-center gap-1.5">
                <input type="number" step="0.5" value={oltPower} onChange={(e) => setOltPower(parseFloat(e.target.value) || 0)} className="w-16 bg-transparent text-3xl font-black text-indigo-600 focus:outline-none text-right p-0" />
                <span className="text-sm font-bold text-slate-300">dBm</span>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 p-10 overflow-auto bg-[radial-gradient(#cbd5e1_1px,transparent_1px)] [background-size:32px_32px]">
        <div className="inline-block min-w-full">
          <div className="p-24 relative min-h-[800px] flex items-center">
            <NodeRenderer node={tree} />
            <div className="fixed top-32 right-12 bg-white/90 backdrop-blur-xl p-8 rounded-[2.5rem] border border-slate-200 shadow-2xl space-y-6 max-w-xs z-[60] transform hover:scale-[1.02] transition-transform">
              <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
                <div className="bg-indigo-50 p-2 rounded-xl text-indigo-600"><Info size={20} /></div>
                <h4 className="text-sm font-black text-slate-800 uppercase tracking-widest">Controles Inteligentes</h4>
              </div>
              <div className="space-y-5">
                <div className="flex items-start gap-4 group">
                  <div className="bg-indigo-100 p-2 rounded-lg"><Plus size={18} className="text-indigo-600" /></div>
                  <div className="flex flex-col">
                    <span className="text-[11px] font-black text-slate-800 uppercase">Inserção Rápida</span>
                    <p className="text-[10px] font-bold text-slate-400 leading-relaxed mt-1">Passe o mouse nas laterais de qualquer bloco e clique no botão "+" para inserir um componente naquele exato ponto.</p>
                  </div>
                </div>
                <div className="flex items-start gap-4 group">
                  <div className="bg-slate-50 p-2 rounded-lg"><Target size={18} className="text-indigo-500" /></div>
                  <div className="flex flex-col"><span className="text-[11px] font-black text-slate-800 uppercase">Ajuste de Perda</span><p className="text-[10px] font-bold text-slate-400 leading-relaxed mt-1">Edite os valores de dB diretamente nos componentes para simular perdas específicas de emenda ou conexão.</p></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      <footer className="bg-white border-t border-slate-200 py-8 px-16 mt-auto text-[11px] font-black text-slate-400 uppercase tracking-[0.3em] flex justify-between items-center shrink-0">
        <div className="flex items-center gap-8">
          <span className="text-slate-600 uppercase">PON Designer Professional Edition</span>
          <div className="h-5 w-px bg-slate-200"></div>
          <div className="flex gap-6">
             <div className="flex items-center gap-2 group"><Target size={16} className="text-indigo-400"/> Edição de Perdas</div>
             <div className="flex items-center gap-2 group"><Plus size={16} className="text-indigo-400"/> Inserção em Linha</div>
             <div className="flex items-center gap-2 group"><Zap size={16} className="text-amber-400"/> GPON / XGS-PON Ready</div>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default App;
