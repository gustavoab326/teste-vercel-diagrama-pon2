
import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom/client';
import { 
  Plus, Trash2, Settings2, Server, Zap, Scissors, Cable, ArrowRight,
  Database, GitBranch, ChevronRight, Info, MoveVertical, RefreshCcw, 
  GripVertical, Target, Sparkles, ChevronDown, Layout, Download, FileText, Maximize2,
  ZoomIn, ZoomOut, Search, Settings, Undo2, Redo2, Move, Upload, X, Edit3, ClipboardList,
  FileDown, Network, Activity, AlertTriangle, CheckCircle2
} from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import { GoogleGenAI } from "@google/genai";

// --- Tipos e Enums ---
enum NodeType {
  OLT = 'OLT',
  FIBER = 'FIBER',
  SPLITTER = 'SPLITTER',
  SPLITTER_UNBALANCED = 'SPLITTER_UNBALANCED',
  CONNECTOR = 'CONNECTOR',
  SPLICE = 'SPLICE',
  ONU = 'ONU'
}

type DistanceUnit = 'm' | 'km';

interface NetworkNode {
  id: string;
  type: NodeType;
  name: string;
  loss: number;
  length?: number;
  unit?: DistanceUnit;
  offsetY?: number;
  attenuationCoefficient?: number;
  splitterRatio?: string;
  unbalancedDropLoss?: number;
  unbalancedPassLoss?: number;
  branches?: NetworkNode[][];
  powerIn?: number;
  powerOut?: number;
}

// --- Constantes ---
const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#0ea5e9'];
const INITIAL_DEFAULTS = {
  attenuation: 0.35,
  connector: 0.25,
  splice: 0.05,
  onu: 0.2,
  extraLossSplitter: 0.0
};

const SPLITTER_LOSSES: Record<string, number> = {
  '1:2': 3.5, '1:4': 7.2, '1:8': 10.5, '1:16': 13.8, '1:32': 17.1, '1:64': 20.5
};

const UNBALANCED_SPLITTER_LOSSES: Record<string, [number, number]> = {
  '05/95': [14.3, 0.8], 
  '10/90': [11.0, 1.1], 
  '20/80': [7.9, 1.6], 
  '30/70': [6.1, 2.2],
  '40/60': [4.8, 2.9], 
  '50/50': [3.7, 3.7]
};

// --- Componentes Auxiliares ---

const EditableValue: React.FC<{
  value: number;
  onCommit: (val: number) => void;
  className?: string;
  step?: string;
  suffix?: string;
}> = ({ value, onCommit, className, step = "0.01", suffix }) => {
  const [temp, setTemp] = useState(value.toString());
  useEffect(() => setTemp(value.toString()), [value]);

  const handleBlur = () => {
    const parsed = parseFloat(temp);
    if (!isNaN(parsed)) onCommit(parsed);
    else setTemp(value.toString());
  };

  return (
    <div className="flex items-center gap-1">
      <input
        type="number"
        step={step}
        value={temp}
        onChange={(e) => setTemp(e.target.value)}
        onBlur={handleBlur}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        className={`bg-transparent border-none p-0 focus:ring-0 text-inherit ${className}`}
      />
      {suffix && <span className="text-[0.6rem] opacity-40 font-bold">{suffix}</span>}
    </div>
  );
};

// --- App Principal ---

const App: React.FC = () => {
  const [projectName, setProjectName] = useState("Meu Projeto PON");
  const [oltPower, setOltPower] = useState<number>(5.0);
  const [zoom, setZoom] = useState<number>(0.9);
  const [showConfig, setShowConfig] = useState(false);
  const [globalDefaults, setGlobalDefaults] = useState(INITIAL_DEFAULTS);
  const [aiAnalysis, setAiAnalysis] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [draggingNode, setDraggingNode] = useState<{ id: string; startY: number; initialOffset: number } | null>(null);
  
  const [rootNode, setRootNode] = useState<NetworkNode>({
    id: 'root', type: NodeType.OLT, name: 'OLT', loss: 0, offsetY: 0, branches: [[]]
  });

  const mainRef = useRef<HTMLDivElement>(null);

  // --- Lógica de Cálculos ---
  
  const calculateNetwork = useCallback((node: NetworkNode, inputPower: number): NetworkNode => {
    let powerOut = inputPower - (node.loss || 0);
    
    if (node.type === NodeType.FIBER) {
      const distKm = node.unit === 'm' ? (node.length || 0) / 1000 : (node.length || 0);
      const att = node.attenuationCoefficient ?? globalDefaults.attenuation;
      powerOut = inputPower - (distKm * att);
    }

    const branches = node.branches?.map((branch, bIdx) => {
      let currentPower = powerOut;
      
      if (node.type === NodeType.SPLITTER_UNBALANCED && node.splitterRatio) {
        const [drop, pass] = UNBALANCED_SPLITTER_LOSSES[node.splitterRatio];
        const branchLoss = bIdx === 0 ? (node.unbalancedDropLoss ?? drop) : (node.unbalancedPassLoss ?? pass);
        currentPower = inputPower - branchLoss - (node.loss || 0);
      }

      return branch.map(child => {
        const updated = calculateNetwork(child, currentPower);
        currentPower = updated.powerOut!;
        return updated;
      });
    });

    return { ...node, powerIn: inputPower, powerOut, branches };
  }, [globalDefaults]);

  const tree = useMemo(() => calculateNetwork(rootNode, oltPower), [rootNode, oltPower, calculateNetwork]);

  const onuList = useMemo(() => {
    const list: { name: string; power: number; path: string }[] = [];
    const traverse = (node: NetworkNode, path = "") => {
      if (node.type === NodeType.ONU) {
        list.push({ name: node.name, power: node.powerOut || 0, path: path || "Tronco" });
      }
      node.branches?.forEach((branch, bIdx) => {
        const branchLabel = node.type === NodeType.SPLITTER_UNBALANCED ? (bIdx === 0 ? "Drop" : "Pass") : `P${bIdx + 1}`;
        branch.forEach(child => traverse(child, path ? `${path} > ${branchLabel}` : branchLabel));
      });
    };
    traverse(tree);
    return list;
  }, [tree]);

  const chartData = useMemo(() => {
    const summary: Record<string, number> = {};
    const traverse = (node: NetworkNode) => {
      if (node.type !== NodeType.OLT && node.type !== NodeType.ONU) {
        const lossVal = node.powerIn! - node.powerOut!;
        summary[node.type] = (summary[node.type] || 0) + lossVal;
      }
      node.branches?.forEach(b => b.forEach(traverse));
    };
    traverse(tree);
    return Object.entries(summary).map(([name, value]) => ({ name, value: Number(value.toFixed(2)) }));
  }, [tree]);

  // --- IA ---

  const runAiAnalysis = async () => {
    if (!onuList.length) return;
    setIsAnalyzing(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const minSignal = Math.min(...onuList.map(o => o.power));
      const prompt = `Analise tecnicamente este projeto PON: Nome: ${projectName}. OLT: ${oltPower}dBm. Total ONUs: ${onuList.length}. Pior sinal: ${minSignal.toFixed(2)}dBm. Dê um parecer técnico curto sobre a saúde desta rede e riscos de perda excessiva seguindo padrões GPON. Responda em Português.`;
      
      const response = await ai.models.generateContent({
        model: 'gemini-3-pro-preview',
        contents: prompt,
      });
      setAiAnalysis(response.text);
    } catch (e) {
      setAiAnalysis("Não foi possível gerar a análise no momento. Verifique sua conexão.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  // --- Árvore de Comandos ---

  const updateNode = (id: string, updates: Partial<NetworkNode>, silent = false) => {
    const traverse = (node: NetworkNode): NetworkNode => {
      if (node.id === id) {
        const updated = { ...node, ...updates };
        if (updates.splitterRatio && updated.type === NodeType.SPLITTER) {
          updated.loss = SPLITTER_LOSSES[updates.splitterRatio] + globalDefaults.extraLossSplitter;
          const ports = parseInt(updates.splitterRatio.split(':')[1]);
          updated.branches = Array(ports).fill(0).map((_, i) => node.branches?.[i] || []);
        }
        if (updates.splitterRatio && updated.type === NodeType.SPLITTER_UNBALANCED) {
          const [d, p] = UNBALANCED_SPLITTER_LOSSES[updates.splitterRatio];
          updated.unbalancedDropLoss = d;
          updated.unbalancedPassLoss = p;
        }
        return updated;
      }
      return { ...node, branches: node.branches?.map(b => b.map(traverse)) };
    };
    setRootNode(prev => traverse(prev));
  };

  const addNode = (parentId: string, branchIndex: number, type: NodeType, insertIndex?: number) => {
    const newId = Math.random().toString(36).substring(7);
    let newNode: NetworkNode = { id: newId, type, name: type, loss: 0, offsetY: 0 };

    switch (type) {
      case NodeType.FIBER: newNode = { ...newNode, name: 'Fibra', length: 1, unit: 'km', attenuationCoefficient: globalDefaults.attenuation }; break;
      case NodeType.SPLITTER: newNode = { ...newNode, name: 'Splitter 1:2', loss: SPLITTER_LOSSES['1:2'], splitterRatio: '1:2', branches: [[], []] }; break;
      case NodeType.SPLITTER_UNBALANCED: newNode = { ...newNode, name: 'Splitter Desb.', splitterRatio: '10/90', branches: [[], []] }; break;
      case NodeType.CONNECTOR: newNode.loss = globalDefaults.connector; break;
      case NodeType.SPLICE: newNode.loss = globalDefaults.splice; break;
      case NodeType.ONU: newNode.name = `ONU ${onuList.length + 1}`; break;
    }

    const traverse = (node: NetworkNode): NetworkNode => {
      if (node.id === parentId) {
        const newBranches = [...(node.branches || [])];
        const branch = [...(newBranches[branchIndex] || [])];
        if (insertIndex !== undefined) branch.splice(insertIndex, 0, newNode);
        else branch.push(newNode);
        newBranches[branchIndex] = branch;
        return { ...node, branches: newBranches };
      }
      return { ...node, branches: node.branches?.map(b => b.map(traverse)) };
    };
    setRootNode(prev => traverse(prev));
  };

  const removeNode = (id: string) => {
    const traverse = (node: NetworkNode): NetworkNode => ({
      ...node,
      branches: node.branches?.map(b => b.filter(c => c.id !== id).map(traverse))
    });
    setRootNode(prev => traverse(prev));
  };

  // --- Componente de Nó ---

  const NodeComponent: React.FC<{ node: NetworkNode, parentId?: string, bIdx?: number, nIdx?: number }> = ({ node, parentId, bIdx, nIdx }) => {
    const isCritical = node.powerOut !== undefined && node.powerOut < -28;
    const isDragging = draggingNode?.id === node.id;

    const onStartDrag = (e: React.MouseEvent) => {
      if ((e.target as HTMLElement).closest('button') || (e.target as HTMLElement).closest('input') || (e.target as HTMLElement).closest('select')) return;
      setDraggingNode({ id: node.id, startY: e.clientY, initialOffset: node.offsetY || 0 });
    };

    const renderBox = () => {
      switch (node.type) {
        case NodeType.OLT:
          return (
            <div className="w-44 h-28 bg-indigo-600 rounded-3xl shadow-xl flex flex-col p-5 text-white border-b-8 border-indigo-900 relative">
              <Server size={22} className="opacity-40" />
              <div className="mt-auto">
                <span className="text-[9px] font-black opacity-60 uppercase block mb-1">TX OLT</span>
                <EditableValue value={oltPower} onCommit={setOltPower} className="text-2xl font-black w-20" suffix="dBm" />
              </div>
            </div>
          );
        case NodeType.FIBER:
          return (
            <div className="flex items-center group relative px-6">
              <div 
                onMouseDown={onStartDrag}
                className={`w-32 h-1.5 bg-blue-500 rounded-full cursor-grab active:cursor-grabbing shadow-[0_0_12px_rgba(59,130,246,0.3)] transition-all ${isDragging ? 'scale-y-150' : ''}`}
              >
                <div className="absolute -top-10 left-1/2 -translate-x-1/2 bg-white border border-blue-100 rounded-full px-3 py-1 shadow-lg flex items-center gap-1">
                  <EditableValue value={node.length!} onCommit={(v) => updateNode(node.id, { length: v })} className="w-8 text-[10px] font-black text-blue-600" />
                  <select value={node.unit} onChange={(e) => updateNode(node.id, { unit: e.target.value as DistanceUnit })} className="text-[8px] font-black uppercase text-blue-300 bg-transparent border-none p-0 outline-none cursor-pointer">
                    <option value="m">m</option><option value="km">km</option>
                  </select>
                </div>
              </div>
              <button onClick={() => removeNode(node.id)} className="absolute -bottom-8 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 p-1.5 text-red-500 transition-all no-print"><Trash2 size={12}/></button>
            </div>
          );
        case NodeType.SPLITTER:
        case NodeType.SPLITTER_UNBALANCED:
          return (
            <div onMouseDown={onStartDrag} className={`w-40 bg-white border-2 rounded-[2rem] p-4 shadow-xl relative group cursor-grab active:cursor-grabbing ${node.type === NodeType.SPLITTER ? 'border-amber-400 ring-4 ring-amber-50' : 'border-orange-500 ring-4 ring-orange-50'}`}>
               <div className="flex justify-between items-start mb-2">
                 <div className={`p-2 rounded-xl ${node.type === NodeType.SPLITTER ? 'bg-amber-50 text-amber-500' : 'bg-orange-50 text-orange-500'}`}>
                   {node.type === NodeType.SPLITTER ? <Zap size={18}/> : <GitBranch size={18}/>}
                 </div>
                 <button onClick={() => removeNode(node.id)} className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-500 transition-all no-print"><Trash2 size={14}/></button>
               </div>
               <select className="w-full text-[10px] font-black bg-slate-50 rounded-xl p-2 outline-none mb-2 uppercase" value={node.splitterRatio} onChange={(e) => updateNode(node.id, { splitterRatio: e.target.value })}>
                 {node.type === NodeType.SPLITTER ? Object.keys(SPLITTER_LOSSES).map(r => <option key={r} value={r}>{r}</option>) : Object.keys(UNBALANCED_SPLITTER_LOSSES).map(r => <option key={r} value={r}>{r}</option>)}
               </select>
               <div className="flex justify-between items-center text-[9px] font-black text-slate-400 uppercase">
                 <span>P. Extra</span>
                 <EditableValue value={node.loss} onCommit={(v) => updateNode(node.id, { loss: v })} className="w-10 text-right text-indigo-600 font-black" suffix="dB" />
               </div>
            </div>
          );
        case NodeType.ONU:
          return (
            <div onMouseDown={onStartDrag} className={`w-16 h-12 bg-white border-2 rounded-2xl flex flex-col items-center justify-center relative group shadow-lg cursor-grab active:cursor-grabbing ${isCritical ? 'border-red-500 ring-4 ring-red-50' : 'border-slate-200'}`}>
              <Activity size={18} className={isCritical ? 'text-red-500' : 'text-emerald-500'} />
              <div className={`absolute -bottom-8 whitespace-nowrap px-2 py-0.5 rounded-full text-[10px] font-black border shadow-sm ${isCritical ? 'bg-red-500 text-white border-red-600' : 'bg-white text-emerald-600 border-emerald-100'}`}>
                {node.powerOut?.toFixed(1)} dBm
              </div>
              <button onClick={() => removeNode(node.id)} className="absolute -top-8 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 p-1.5 text-red-500 transition-all no-print"><Trash2 size={12}/></button>
            </div>
          );
        default:
          return (
            <div onMouseDown={onStartDrag} className="w-8 h-8 rounded-full bg-white border-2 border-slate-200 flex items-center justify-center group relative shadow-md cursor-grab active:cursor-grabbing">
              <div className="absolute -top-10 opacity-0 group-hover:opacity-100 bg-white border border-slate-100 rounded-lg px-2 py-1 shadow-xl z-50">
                <EditableValue value={node.loss} onCommit={(v) => updateNode(node.id, { loss: v })} className="w-8 text-center text-[10px] font-black" suffix="dB" />
              </div>
              {node.type === NodeType.CONNECTOR ? <Settings2 size={14} className="text-emerald-500"/> : <Scissors size={14} className="text-purple-500"/>}
              <button onClick={() => removeNode(node.id)} className="absolute -bottom-8 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 p-1 text-red-400 no-print"><Trash2 size={12}/></button>
            </div>
          );
      }
    };

    return (
      <div style={{ transform: `translateY(${node.offsetY || 0}px)` }} className="flex items-center">
        {renderBox()}
        {node.branches && node.branches.length > 0 && (
          <div className="flex flex-col gap-12 ml-10 pl-10 border-l-2 border-slate-200/50 relative">
            {node.branches.map((branch, bi) => (
              <div key={bi} className="flex items-center relative">
                <div className="absolute -left-10 w-10 h-[2px] bg-slate-200/50"></div>
                {node.type === NodeType.SPLITTER_UNBALANCED && (
                  <span className={`absolute -left-10 -top-4 text-[8px] font-black uppercase ${bi === 0 ? 'text-orange-600' : 'text-slate-400'}`}>
                    {bi === 0 ? 'Drop' : 'Pass'}
                  </span>
                )}
                {branch.map((child, ni) => (
                  <NodeComponent key={child.id} node={child} parentId={node.id} bIdx={bi} nIdx={ni} />
                ))}
                {/* Botão de Adição Contextual */}
                <div className="ml-6 flex items-center gap-1.5 p-1.5 bg-white/50 border-2 border-dashed border-slate-200 rounded-2xl no-print hover:border-indigo-400 transition-all opacity-40 hover:opacity-100 h-10 group/add">
                   <button onClick={() => addNode(node.id, bi, NodeType.FIBER)} className="p-1.5 text-blue-500 hover:scale-125 transition-all"><Cable size={16}/></button>
                   <button onClick={() => addNode(node.id, bi, NodeType.SPLITTER)} className="p-1.5 text-amber-500 hover:scale-125 transition-all"><Zap size={16}/></button>
                   <button onClick={() => addNode(node.id, bi, NodeType.SPLITTER_UNBALANCED)} className="p-1.5 text-orange-500 hover:scale-125 transition-all"><GitBranch size={16}/></button>
                   <button onClick={() => addNode(node.id, bi, NodeType.CONNECTOR)} className="p-1.5 text-emerald-500 hover:scale-125 transition-all"><Settings2 size={16}/></button>
                   <button onClick={() => addNode(node.id, bi, NodeType.ONU)} className="p-1.5 text-slate-500 hover:scale-125 transition-all"><ArrowRight size={16}/></button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (draggingNode) {
        const deltaY = (e.clientY - draggingNode.startY) / zoom;
        updateNode(draggingNode.id, { offsetY: draggingNode.initialOffset + deltaY }, true);
      }
    };
    const onMouseUp = () => setDraggingNode(null);
    if (draggingNode) {
      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [draggingNode, zoom]);

  return (
    <div className="h-screen w-screen flex flex-col bg-slate-50 overflow-hidden text-slate-800">
      {/* Header */}
      <header className="h-20 bg-white border-b border-slate-200 px-8 flex justify-between items-center z-[100] no-print">
        <div className="flex items-center gap-4">
          <div className="bg-indigo-600 p-2.5 rounded-2xl text-white shadow-lg"><Network size={24} /></div>
          <div>
            <input 
              value={projectName} 
              onChange={(e) => setProjectName(e.target.value)} 
              className="text-lg font-black text-slate-800 bg-transparent border-none p-0 focus:ring-0 uppercase tracking-tight"
            />
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Editor de Link Budget PON</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex bg-slate-100 rounded-xl p-1">
            <button onClick={() => setZoom(z => Math.max(0.2, z - 0.1))} className="p-2 hover:bg-white rounded-lg transition-all text-slate-500"><ZoomOut size={18}/></button>
            <div className="px-3 text-[10px] font-black text-slate-400 flex items-center">{(zoom * 100).toFixed(0)}%</div>
            <button onClick={() => setZoom(z => Math.min(2.0, z + 0.1))} className="p-2 hover:bg-white rounded-lg transition-all text-slate-500"><ZoomIn size={18}/></button>
          </div>
          <button onClick={() => setShowConfig(true)} className="p-3 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-all text-slate-600"><Settings size={20}/></button>
          <div className="h-8 w-px bg-slate-200 mx-2"></div>
          <button onClick={() => window.print()} className="bg-indigo-600 text-white px-6 py-3 rounded-xl font-black text-xs uppercase tracking-widest flex items-center gap-2 hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100">
            <Download size={18}/> Exportar Relatório
          </button>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Canvas Area */}
        <main className="flex-1 overflow-auto bg-[radial-gradient(#e2e8f0_1px,transparent_1px)] [background-size:24px_24px] relative no-print custom-scrollbar">
          <div 
            className="inline-flex min-w-full min-h-full items-center justify-center origin-center transition-transform duration-75 p-[800px]"
            style={{ transform: `scale(${zoom})` }}
          >
            <NodeComponent node={tree} />
          </div>
        </main>

        {/* Sidebar Info */}
        <aside className="w-[400px] bg-white border-l border-slate-200 flex flex-col no-print">
           <div className="p-8 border-b border-slate-100 space-y-6">
              <h3 className="text-sm font-black text-slate-800 uppercase flex items-center gap-2"><Activity size={18} className="text-indigo-600"/> Dashboard de Link</h3>
              <div className="grid grid-cols-2 gap-4">
                 <div className="bg-slate-50 p-5 rounded-3xl border border-slate-100">
                    <span className="text-[9px] font-black text-slate-400 uppercase block mb-1">Terminais</span>
                    <span className="text-xl font-black text-slate-800">{onuList.length}</span>
                 </div>
                 <div className="bg-slate-50 p-5 rounded-3xl border border-slate-100">
                    <span className="text-[9px] font-black text-slate-400 uppercase block mb-1">Pior Sinal</span>
                    <span className={`text-xl font-black ${onuList.some(o => o.power < -28) ? 'text-red-500' : 'text-emerald-500'}`}>
                      {onuList.length ? Math.min(...onuList.map(o => o.power)).toFixed(1) : "0.0"} <small className="text-[10px]">dBm</small>
                    </span>
                 </div>
              </div>

              {/* Chart Breakdown */}
              <div className="h-48 w-full mt-4">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={chartData} cx="50%" cy="50%" innerRadius={40} outerRadius={60} paddingAngle={5} dataKey="value">
                      {chartData.map((_, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
           </div>

           <div className="flex-1 overflow-y-auto p-8 space-y-8 custom-scrollbar">
              <div className="p-6 bg-indigo-50 rounded-[2rem] border border-indigo-100 relative overflow-hidden">
                 <div className="flex justify-between items-center mb-4 z-10 relative">
                   <h5 className="text-[10px] font-black text-indigo-600 uppercase flex items-center gap-2"><Sparkles size={14}/> Análise da IA Gemini</h5>
                   <button 
                    onClick={runAiAnalysis} 
                    disabled={isAnalyzing || !onuList.length}
                    className="p-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-all shadow-md shadow-indigo-200"
                   >
                     {isAnalyzing ? <RefreshCcw size={14} className="animate-spin"/> : <Search size={14}/>}
                   </button>
                 </div>
                 <p className="text-[11px] text-indigo-900/70 font-bold leading-relaxed italic z-10 relative">
                   {aiAnalysis || "Clique na lupa para gerar um parecer técnico com Inteligência Artificial sobre este projeto."}
                 </p>
                 <Sparkles className="absolute -bottom-4 -right-4 text-indigo-200 opacity-20" size={80} />
              </div>

              <div>
                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-4">Lista de Terminais</h4>
                <div className="space-y-3">
                  {onuList.map((o, i) => (
                    <div key={i} className="flex justify-between items-center p-4 bg-slate-50 rounded-2xl border border-slate-100 hover:border-indigo-200 transition-colors group">
                       <div className="flex flex-col">
                         <span className="text-[11px] font-black text-slate-700">{o.name}</span>
                         <span className="text-[8px] font-bold text-slate-400 truncate w-32">{o.path}</span>
                       </div>
                       <span className={`text-xs font-black ${o.power < -28 ? 'text-red-500' : 'text-emerald-500'}`}>{o.power.toFixed(1)} dBm</span>
                    </div>
                  ))}
                </div>
              </div>
           </div>
        </aside>
      </div>

      {/* Config Modal */}
      {showConfig && (
        <div className="fixed inset-0 z-[500] flex items-center justify-center bg-black/40 backdrop-blur-sm px-4">
          <div className="bg-white rounded-[2.5rem] w-full max-w-md p-10 shadow-2xl animate-in zoom-in duration-200">
            <div className="flex justify-between items-center mb-8">
              <h2 className="text-xl font-black text-slate-800 uppercase tracking-tight">Parâmetros de Rede</h2>
              <button onClick={() => setShowConfig(false)} className="p-2 hover:bg-slate-100 rounded-full transition-all"><X size={20}/></button>
            </div>
            <div className="space-y-6">
              {[
                { label: 'Fibra (dB/km)', key: 'attenuation', icon: <Cable size={18}/> },
                { label: 'Conector (dB)', key: 'connector', icon: <Settings2 size={18}/> },
                { label: 'Emenda (dB)', key: 'splice', icon: <Scissors size={18}/> }
              ].map(item => (
                <div key={item.key} className="flex items-center justify-between p-5 bg-slate-50 rounded-3xl border border-slate-100">
                   <div className="flex items-center gap-3">
                     <div className="text-slate-400">{item.icon}</div>
                     <span className="text-[11px] font-black text-slate-800 uppercase">{item.label}</span>
                   </div>
                   <EditableValue 
                    value={(globalDefaults as any)[item.key]} 
                    onCommit={(v) => setGlobalDefaults({...globalDefaults, [item.key]: v})} 
                    className="w-12 text-center text-sm font-black text-indigo-600"
                   />
                </div>
              ))}
            </div>
            <button onClick={() => setShowConfig(false)} className="w-full mt-10 py-5 bg-indigo-600 text-white rounded-[2rem] font-black text-xs uppercase tracking-widest shadow-xl shadow-indigo-100 hover:bg-indigo-700 transition-all">Confirmar Alterações</button>
          </div>
        </div>
      )}

      {/* Relatório de Impressão (Apenas visível ao imprimir) */}
      <div className="hidden print:block bg-white p-16 text-slate-900">
        <div className="border-b-4 border-indigo-600 pb-8 mb-12 flex justify-between items-end">
           <div>
             <h1 className="text-5xl font-black uppercase tracking-tighter mb-2">{projectName}</h1>
             <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">Relatório Técnico de Infraestrutura e Link Budget</p>
           </div>
           <div className="text-right">
             <p className="text-[10px] font-black uppercase text-slate-400">Data de Geração</p>
             <p className="font-bold text-lg">{new Date().toLocaleDateString('pt-BR')}</p>
           </div>
        </div>

        <div className="grid grid-cols-3 gap-8 mb-12">
          <div className="bg-slate-50 p-8 rounded-[2rem] border border-slate-100 text-center">
            <p className="text-[11px] font-black text-slate-400 uppercase mb-2">Potência OLT</p>
            <p className="text-3xl font-black text-indigo-600">{oltPower} dBm</p>
          </div>
          <div className="bg-slate-50 p-8 rounded-[2rem] border border-slate-100 text-center">
            <p className="text-[11px] font-black text-slate-400 uppercase mb-2">Total ONUs</p>
            <p className="text-3xl font-black text-indigo-600">{onuList.length}</p>
          </div>
          <div className="bg-slate-50 p-8 rounded-[2rem] border border-slate-100 text-center">
            <p className="text-[11px] font-black text-slate-400 uppercase mb-2">Pior Sinal ONU</p>
            <p className={`text-3xl font-black ${onuList.some(o => o.power < -28) ? 'text-red-500' : 'text-emerald-500'}`}>
               {onuList.length ? Math.min(...onuList.map(o => o.power)).toFixed(1) : "N/A"}
            </p>
          </div>
        </div>

        <h3 className="text-xl font-black uppercase tracking-tight mb-8 flex items-center gap-3">
          <ClipboardList size={26} className="text-indigo-600"/> Tabela de Terminais (ONUs)
        </h3>
        <table className="w-full border-collapse mb-16">
           <thead>
             <tr className="bg-slate-50">
               <th className="p-5 text-left text-[11px] font-black uppercase border-b-2 border-slate-200">Identificação</th>
               <th className="p-5 text-left text-[11px] font-black uppercase border-b-2 border-slate-200">Hierarquia Óptica</th>
               <th className="p-5 text-right text-[11px] font-black uppercase border-b-2 border-slate-200">Potência (dBm)</th>
               <th className="p-5 text-center text-[11px] font-black uppercase border-b-2 border-slate-200">Status</th>
             </tr>
           </thead>
           <tbody>
             {onuList.map((o, idx) => (
               <tr key={idx} className="border-b border-slate-100">
                 <td className="p-5 font-bold text-slate-800 text-lg">{o.name}</td>
                 <td className="p-5 text-xs text-slate-500 italic uppercase">{o.path}</td>
                 <td className={`p-5 text-right font-black text-lg ${o.power < -28 ? 'text-red-600' : 'text-emerald-600'}`}>{o.power.toFixed(2)}</td>
                 <td className="p-5 text-center">
                    <span className={`text-[9px] font-black uppercase px-3 py-1 rounded-full ${o.power < -28 ? 'bg-red-100 text-red-600' : 'bg-emerald-100 text-emerald-600'}`}>
                      {o.power < -28 ? "Falha" : "Operacional"}
                    </span>
                 </td>
               </tr>
             ))}
           </tbody>
        </table>

        {aiAnalysis && (
          <div className="p-10 bg-indigo-50 rounded-[3rem] border border-indigo-100 break-inside-avoid">
             <h4 className="text-sm font-black text-indigo-600 uppercase mb-6 flex items-center gap-2"><Sparkles size={18}/> Parecer de Engenharia Assistido por IA</h4>
             <p className="text-sm text-indigo-900/80 font-medium leading-relaxed whitespace-pre-line">{aiAnalysis}</p>
          </div>
        )}
        
        <div className="mt-auto pt-20 border-t border-slate-100 flex justify-between items-center text-[10px] font-black text-slate-300 uppercase tracking-[0.3em]">
           <span>Relatório Gerado por PON LOSS PRO v1.2</span>
           <span>Padrão ITU-T G.984</span>
        </div>
      </div>
    </div>
  );
};

const root = ReactDOM.createRoot(document.getElementById('root')!);
root.render(<App />);
