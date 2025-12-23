
import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom/client';
import { 
  Plus, Trash2, Settings2, Server, Zap, Scissors, Cable, ArrowRight,
  Database, GitBranch, ChevronRight, Info, MoveVertical, RefreshCcw, 
  GripVertical, Target, Sparkles, ChevronDown, Layout, Download, FileText, Maximize2,
  ZoomIn, ZoomOut, Search, Settings, Undo2, Redo2, Move, Upload, X, Edit3, ClipboardList,
  FileDown, Network
} from 'lucide-react';

// --- Enums & Constantes ---
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

// Valores atualizados conforme a imagem técnica fornecida
const UNBALANCED_SPLITTER_LOSSES: Record<string, [number, number]> = {
  '05/95': [14.3, 0.8], 
  '10/90': [11.0, 1.1], 
  '20/80': [7.9, 1.6], 
  '30/70': [6.1, 2.2],
  '40/60': [4.8, 2.9], 
  '50/50': [3.7, 3.7]
};

// --- Componente de Input Inteligente ---
const EditableValue: React.FC<{
  value: number;
  onCommit: (val: number) => void;
  className?: string;
  step?: string;
}> = ({ value, onCommit, className, step = "0.01" }) => {
  const [temp, setTemp] = useState(value.toString());
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setTemp(value.toString());
  }, [value]);

  const handleCommit = () => {
    const parsed = parseFloat(temp);
    if (!isNaN(parsed)) onCommit(parsed);
    else setTemp(value.toString());
  };

  return (
    <input
      ref={inputRef}
      type="number"
      step={step}
      value={temp}
      onChange={(e) => setTemp(e.target.value)}
      onBlur={handleCommit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          handleCommit();
          inputRef.current?.blur();
        }
      }}
      className={className}
    />
  );
};

// --- App Principal ---
const App: React.FC = () => {
  const [projectName, setProjectName] = useState("Projeto PON Sem Título");
  const [oltPower, setOltPower] = useState<number>(5.0);
  const [zoom, setZoom] = useState<number>(1.0);
  const [draggingNode, setDraggingNode] = useState<{ id: string; startY: number; initialOffset: number } | null>(null);
  const [insertionMenu, setInsertionMenu] = useState<{ parentId: string, branchIndex: number, insertIndex: number, x: number, y: number } | null>(null);
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [globalDefaults, setGlobalDefaults] = useState(INITIAL_DEFAULTS);
  
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0, scrollLeft: 0, scrollTop: 0 });

  const [rootNode, setRootNode] = useState<NetworkNode>({
    id: 'root', type: NodeType.OLT, name: 'OLT', loss: 0, offsetY: 0, branches: [[]]
  });
  const [history, setHistory] = useState<{ past: any[], future: any[] }>({ past: [], future: [] });

  const mainRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const saveHistory = useCallback((currentRoot: NetworkNode, currentPower: number) => {
    setHistory(prev => ({
      past: [...prev.past.slice(-20), { root: JSON.parse(JSON.stringify(currentRoot)), power: currentPower }],
      future: []
    }));
  }, []);

  const undo = () => {
    if (history.past.length === 0) return;
    const last = history.past[history.past.length - 1];
    setHistory(prev => ({
      past: prev.past.slice(0, -1),
      future: [{ root: JSON.parse(JSON.stringify(rootNode)), power: oltPower }, ...prev.future]
    }));
    setRootNode(last.root);
    setOltPower(last.power);
  };

  const redo = () => {
    if (history.future.length === 0) return;
    const next = history.future[0];
    setHistory(prev => ({
      past: [...prev.past, { root: JSON.parse(JSON.stringify(rootNode)), power: oltPower }],
      future: prev.future.slice(1)
    }));
    setRootNode(next.root);
    setOltPower(next.power);
  };

  const exportProject = () => {
    const projectData = { version: '2.1', projectName, oltPower, rootNode, globalDefaults };
    const blob = new Blob([JSON.stringify(projectData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const safeName = projectName.toLowerCase().replace(/[^a-z0-9]/g, '-');
    link.download = `${safeName}-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const generateTextTree = (node: NetworkNode, prefix = "", isLast = true, branchLabel = ""): string => {
    let output = "";
    const connector = isLast ? "└─" : "├─";
    const label = branchLabel ? `<span style="color:#6366f1">[${branchLabel}]</span> ` : "";
    
    output += `${prefix}${connector} ${label}<b>${node.name}</b>`;
    if (node.type === NodeType.FIBER) output += ` (${node.length}${node.unit})`;
    if (node.powerOut !== undefined) output += ` <b style="color:#4f46e5">${node.powerOut.toFixed(2)} dBm</b>`;
    output += "<br/>";

    const newPrefix = prefix + (isLast ? "&nbsp;&nbsp;&nbsp;&nbsp;" : "│&nbsp;&nbsp;&nbsp;");

    if (node.branches && node.branches.length > 0) {
      const allChildren: {node: NetworkNode, label: string}[] = [];
      node.branches.forEach((branch, bIdx) => {
        const bLabel = node.type === NodeType.SPLITTER_UNBALANCED ? (bIdx === 0 ? "DROP" : "PASS") : `P${bIdx+1}`;
        branch.forEach(child => {
          allChildren.push({ node: child, label: bLabel });
        });
      });

      allChildren.forEach((childData, idx) => {
        output += generateTextTree(
          childData.node, 
          newPrefix, 
          idx === allChildren.length - 1, 
          childData.label
        );
      });
    }

    return output;
  };

  const exportToWord = () => {
    const date = new Date().toLocaleDateString('pt-BR');
    const worstSignal = onuList.length ? Math.min(...onuList.map(o => o.power)).toFixed(2) : "0.00";
    const textTree = generateTextTree(tree, "", true, "");

    const htmlContent = `
      <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
      <head>
        <meta charset='utf-8'>
        <title>${projectName}</title>
        <style>
          body { font-family: 'Calibri', 'Arial', sans-serif; line-height: 1.4; color: #333; }
          .header { border-bottom: 2pt solid #4f46e5; padding-bottom: 10pt; margin-bottom: 20pt; }
          .title { color: #1e1b4b; font-size: 24pt; font-weight: bold; text-transform: uppercase; margin: 0; }
          .info-table { width: 100%; border-collapse: collapse; margin-bottom: 20pt; }
          .info-box { background-color: #f8fafc; border: 1pt solid #e2e8f0; padding: 10pt; text-align: center; width: 33%; }
          .label { font-size: 8pt; color: #64748b; font-weight: bold; text-transform: uppercase; }
          .value { font-size: 14pt; color: #4f46e5; font-weight: bold; }
          .diagram-box { 
            background-color: #f1f5f9; 
            border: 1pt solid #cbd5e1; 
            padding: 20pt; 
            font-family: 'Consolas', 'Courier New', monospace; 
            font-size: 10pt; 
            margin-top: 20pt;
            white-space: pre;
          }
          .data-table { width: 100%; border-collapse: collapse; margin-top: 20pt; }
          .data-table th { background-color: #f1f5f9; border-bottom: 1.5pt solid #cbd5e1; padding: 6pt; text-align: left; font-size: 9pt; }
          .data-table td { border-bottom: 0.5pt solid #f1f5f9; padding: 6pt; font-size: 9pt; }
          .footer { margin-top: 40pt; border-top: 1pt solid #e2e8f0; padding-top: 10pt; font-size: 8pt; color: #94a3b8; text-align: center; }
        </style>
      </head>
      <body>
        <div class='header'>
          <h1 class='title'>${projectName}</h1>
          <p style='color:#6366f1; font-weight:bold;'>RELATÓRIO TÉCNICO DE REDE PON</p>
          <p style='text-align: right; font-size: 8pt;'>Data: ${date}</p>
        </div>

        <table class='info-table'>
          <tr>
            <td class='info-box'><div class='label'>Potência OLT</div><div class='value'>${oltPower.toFixed(1)} dBm</div></td>
            <td class='info-box'><div class='label'>Terminais ONUs</div><div class='value'>${onuList.length}</div></td>
            <td class='info-box'><div class='label'>Status</div><div class='value' style='color: ${parseFloat(worstSignal) < -28 ? "#ef4444" : "#10b981"}'>${parseFloat(worstSignal) < -28 ? "CRÍTICO" : "OPERACIONAL"}</div></td>
          </tr>
        </table>

        <h3 style='color: #1e1b4b; text-transform: uppercase;'>Topologia Estruturada</h3>
        <div class='diagram-box'>
          ${textTree}
        </div>

        <h3 style='color: #1e1b4b; text-transform: uppercase; margin-top: 25pt;'>Detalhamento de Sinal</h3>
        <table class='data-table'>
          <thead>
            <tr><th>Terminal</th><th>Caminho Ótico</th><th style='text-align: right;'>Sinal (dBm)</th></tr>
          </thead>
          <tbody>
            ${onuList.map(onu => `
              <tr><td><b>${onu.name}</b></td><td style='color:#64748b; font-size:7pt;'>${onu.path}</td><td style='text-align: right; font-weight: bold; color: ${onu.power < -28 ? "#ef4444" : "#10b981"}'>${onu.power.toFixed(2)}</td></tr>
            `).join('')}
          </tbody>
        </table>
        <div class='footer'>PON Diagram Editor V2.1</div>
      </body>
      </html>
    `;

    const blob = new Blob([htmlContent], { type: 'application/msword' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const safeName = projectName.toLowerCase().replace(/[^a-z0-9]/g, '-');
    link.download = `${safeName}-relatorio.doc`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const importProject = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const json = JSON.parse(event.target?.result as string);
        if (json.rootNode && typeof json.oltPower === 'number') {
          saveHistory(rootNode, oltPower);
          setRootNode(json.rootNode);
          setOltPower(json.oltPower);
          if (json.projectName) setProjectName(json.projectName);
          if (json.globalDefaults) setGlobalDefaults(json.globalDefaults);
        }
      } catch (err) { alert('Erro ao importar arquivo.'); }
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === 'z') { e.preventDefault(); undo(); }
      if (e.ctrlKey && e.key === 'y') { e.preventDefault(); redo(); }
      if (e.ctrlKey && e.key === 'p') { e.preventDefault(); window.print(); }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [history, rootNode, oltPower]);

  const calculatePower = useCallback((node: NetworkNode, inputPower: number): NetworkNode => {
    let powerOut = inputPower - node.loss;
    if (node.type === NodeType.FIBER) {
      const distKm = node.unit === 'm' ? (node.length || 0) / 1000 : (node.length || 0);
      const calculatedLoss = distKm * (node.attenuationCoefficient || globalDefaults.attenuation);
      powerOut = inputPower - calculatedLoss;
    }
    const calculatedBranches = node.branches?.map((branch, bIndex) => {
      let currentPower = powerOut;
      if (node.type === NodeType.SPLITTER_UNBALANCED && node.splitterRatio) {
        const defs = UNBALANCED_SPLITTER_LOSSES[node.splitterRatio];
        const dropLoss = node.unbalancedDropLoss ?? defs[0];
        const passLoss = node.unbalancedPassLoss ?? defs[1];
        const branchLoss = bIndex === 0 ? dropLoss : passLoss;
        currentPower = inputPower - branchLoss - (node.loss || 0);
      }
      return branch.map(child => {
        const updatedChild = calculatePower(child, currentPower);
        currentPower = updatedChild.powerOut!;
        return updatedChild;
      });
    });
    return { ...node, powerIn: inputPower, powerOut, branches: calculatedBranches };
  }, [globalDefaults]);

  const tree = useMemo(() => calculatePower(rootNode, oltPower), [rootNode, oltPower, calculatePower]);

  const getAllOnus = useCallback((node: NetworkNode, path = ""): { name: string, power: number, path: string }[] => {
    let result: { name: string, power: number, path: string }[] = [];
    if (node.type === NodeType.ONU) {
      result.push({ name: node.name, power: node.powerOut || 0, path: path || "Linha Principal" });
    }
    node.branches?.forEach((branch, bIndex) => {
      const branchName = node.type === NodeType.SPLITTER_UNBALANCED ? (bIndex === 0 ? "Drop" : "Pass") : `Porta ${bIndex + 1}`;
      const newPath = path ? `${path} > ${branchName}` : branchName;
      branch.forEach(child => {
        result = [...result, ...getAllOnus(child, newPath)];
      });
    });
    return result;
  }, []);

  const onuList = useMemo(() => getAllOnus(tree), [tree, getAllOnus]);

  const updateTree = (node: NetworkNode, id: string, updater: (n: NetworkNode) => NetworkNode): NetworkNode => {
    if (node.id === id) return updater(node);
    if (!node.branches) return node;
    return { ...node, branches: node.branches.map(branch => branch.map(child => updateTree(child, id, updater))) };
  };

  const updateNodeData = (id: string, updates: Partial<NetworkNode>, silent = false) => {
    if (!silent) saveHistory(rootNode, oltPower);
    setRootNode(prev => updateTree(prev, id, (node) => {
      const updated = { ...node, ...updates };

      if (updates.type && (updates.type === NodeType.SPLITTER || updates.type === NodeType.SPLITTER_UNBALANCED)) {
        if (updates.type === NodeType.SPLITTER) {
          // Alterado para 1:2 como padrão
          updated.splitterRatio = '1:2'; 
          updated.loss = SPLITTER_LOSSES['1:2'] + globalDefaults.extraLossSplitter; 
          updated.branches = Array(2).fill(0).map(() => []);
        } else {
          updated.splitterRatio = '10/90'; updated.loss = globalDefaults.extraLossSplitter; updated.branches = [[], []];
          const defs = UNBALANCED_SPLITTER_LOSSES['10/90'];
          updated.unbalancedDropLoss = defs[0]; updated.unbalancedPassLoss = defs[1];
        }
      }

      if (updated.type === NodeType.SPLITTER && updates.splitterRatio !== undefined) {
        updated.loss = (SPLITTER_LOSSES[updates.splitterRatio] || 0) + globalDefaults.extraLossSplitter;
        const numPorts = parseInt(updates.splitterRatio.split(':')[1]);
        if (numPorts !== node.branches?.length) {
          updated.branches = Array(numPorts).fill(0).map((_, i) => node.branches?.[i] || []);
        }
      }

      // Lógica de atualização automática para Splitter Desbalanceado ao trocar o ratio
      if (updated.type === NodeType.SPLITTER_UNBALANCED && updates.splitterRatio !== undefined) {
        const defs = UNBALANCED_SPLITTER_LOSSES[updates.splitterRatio];
        if (defs) {
          updated.unbalancedDropLoss = defs[0];
          updated.unbalancedPassLoss = defs[1];
        }
      }

      if (updated.type === NodeType.FIBER && (updates.length !== undefined || updates.attenuationCoefficient !== undefined || updates.unit !== undefined)) {
        const distKm = updated.unit === 'm' ? (updated.length || 0) / 1000 : (updated.length || 0);
        updated.loss = distKm * (updated.attenuationCoefficient ?? globalDefaults.attenuation);
      }
      return updated;
    }));
  };

  const removeElement = (id: string) => {
    saveHistory(rootNode, oltPower);
    setRootNode(prev => {
      const traverseAndRemove = (node: NetworkNode): NetworkNode => {
        if (!node.branches) return node;
        const newBranches = node.branches.map(branch => {
          const index = branch.findIndex(child => child.id === id);
          if (index !== -1) {
            const nodeToRemove = branch[index];
            const updatedBranch = [...branch];
            let inheritedNodes: NetworkNode[] = [];
            if ((nodeToRemove.type === NodeType.SPLITTER || nodeToRemove.type === NodeType.SPLITTER_UNBALANCED) 
                && nodeToRemove.branches && nodeToRemove.branches[0]) {
              inheritedNodes = nodeToRemove.branches[0];
            }
            updatedBranch.splice(index, 1, ...inheritedNodes);
            return updatedBranch;
          }
          return branch.map(traverseAndRemove);
        });
        return { ...node, branches: newBranches };
      };
      return traverseAndRemove(prev);
    });
  };

  const addElementAtPosition = (parentId: string, branchIndex: number, type: NodeType, insertIndex?: number) => {
    saveHistory(rootNode, oltPower);
    const newId = Math.random().toString(36).substr(2, 9);
    let newNode: NetworkNode;
    
    switch (type) {
      case NodeType.FIBER: newNode = { id: newId, type, name: 'Fibra', loss: globalDefaults.attenuation, length: 1, unit: 'km', attenuationCoefficient: globalDefaults.attenuation, offsetY: 0 }; break;
      case NodeType.SPLITTER: 
        // Alterado para 1:2 como padrão na criação
        newNode = { id: newId, type, name: 'Splitter', loss: SPLITTER_LOSSES['1:2'] + globalDefaults.extraLossSplitter, splitterRatio: '1:2', branches: Array(2).fill(0).map(() => []), offsetY: 0 }; break;
      case NodeType.SPLITTER_UNBALANCED: 
        const defs = UNBALANCED_SPLITTER_LOSSES['10/90'];
        newNode = { id: newId, type, name: 'Splitter Desb.', loss: globalDefaults.extraLossSplitter, splitterRatio: '10/90', unbalancedDropLoss: defs[0], unbalancedPassLoss: defs[1], branches: [[], []], offsetY: 0 }; break;
      case NodeType.CONNECTOR: newNode = { id: newId, type, name: 'Conector', loss: globalDefaults.connector, offsetY: 0 }; break;
      case NodeType.SPLICE: newNode = { id: newId, type, name: 'Fusão', loss: globalDefaults.splice, offsetY: 0 }; break;
      default: newNode = { id: newId, type, name: `ONU ${onuList.length + 1}`, loss: globalDefaults.onu, offsetY: 0 };
    }

    setRootNode(prev => updateTree(prev, parentId, (node) => {
      const newBranches = [...(node.branches || [])];
      let targetBranch = [...newBranches[branchIndex]];
      if (insertIndex !== undefined && insertIndex < targetBranch.length) {
        const nodesAfter = targetBranch.slice(insertIndex);
        if (newNode.type === NodeType.SPLITTER || newNode.type === NodeType.SPLITTER_UNBALANCED) {
          newNode.branches![0] = nodesAfter;
          targetBranch = [...targetBranch.slice(0, insertIndex), newNode];
        } else {
          targetBranch.splice(insertIndex, 0, newNode);
        }
      } else {
        targetBranch.push(newNode);
      }
      newBranches[branchIndex] = targetBranch;
      return { ...node, branches: newBranches };
    }));
    setInsertionMenu(null);
  };

  const handlePanStart = (e: React.MouseEvent) => {
    if (e.button === 1) {
      e.preventDefault();
      setIsPanning(true);
      setPanStart({ x: e.clientX, y: e.clientY, scrollLeft: mainRef.current?.scrollLeft || 0, scrollTop: mainRef.current?.scrollTop || 0 });
    }
  };
  const handlePanMove = (e: React.MouseEvent) => {
    if (!isPanning || !mainRef.current) return;
    mainRef.current.scrollLeft = panStart.scrollLeft - (e.clientX - panStart.x);
    mainRef.current.scrollTop = panStart.scrollTop - (e.clientY - panStart.y);
  };
  const handlePanEnd = () => setIsPanning(false);

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (draggingNode) {
        const deltaY = (e.clientY - draggingNode.startY) / zoom;
        updateNodeData(draggingNode.id, { offsetY: draggingNode.initialOffset + deltaY }, true);
      }
    };
    const onMouseUp = () => setDraggingNode(null);
    if (draggingNode) { window.addEventListener('mousemove', onMouseMove); window.addEventListener('mouseup', onMouseUp); }
    return () => { window.removeEventListener('mousemove', onMouseMove); window.removeEventListener('mouseup', onMouseUp); };
  }, [draggingNode, zoom]);

  const onStartDrag = (e: React.MouseEvent, node: NetworkNode) => {
    if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'SELECT' || (e.target as HTMLElement).closest('button')) return;
    e.preventDefault();
    setDraggingNode({ id: node.id, startY: e.clientY, initialOffset: node.offsetY || 0 });
  };

  const NodeRenderer: React.FC<{ node: NetworkNode, parentId?: string, branchIndex?: number, nodeIndex?: number }> = ({ node, parentId, branchIndex, nodeIndex }) => {
    const isThisDragging = draggingNode?.id === node.id;
    const powerColor = (p: number) => p < -28 ? 'text-red-600' : p < -25 ? 'text-amber-600' : 'text-emerald-600';

    const SidePlus = ({ side }: { side: 'left' | 'right' }) => {
      if (node.type === NodeType.OLT || node.type === NodeType.ONU) return null;
      const idx = side === 'left' ? nodeIndex! : nodeIndex! + 1;
      return (
        <button onClick={(e) => setInsertionMenu({ parentId: parentId!, branchIndex: branchIndex!, insertIndex: idx, x: e.clientX, y: e.clientY })}
          className={`absolute ${side === 'left' ? '-left-3' : '-right-3'} top-1/2 -translate-y-1/2 z-40 opacity-0 group-hover:opacity-100 transition-all bg-indigo-600 text-white rounded-full p-1 shadow-xl hover:scale-125 border-2 border-white no-print`}
        >
          <Plus size={10} strokeWidth={4} />
        </button>
      );
    };

    const DragHandle = () => (
      <div className="absolute -left-6 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-40 transition-opacity text-indigo-900 pointer-events-none no-print">
        <GripVertical size={16} />
      </div>
    );

    const renderContent = () => {
      switch (node.type) {
        case NodeType.OLT:
          return (
            <div onMouseDown={(e) => { if(e.button === 0) onStartDrag(e, node); }} className="relative group cursor-grab active:cursor-grabbing flex items-center">
              <div className="w-44 h-28 bg-indigo-600 rounded-2xl shadow-2xl flex flex-col p-5 border-b-8 border-indigo-900 relative shrink-0">
                <Server size={24} className="text-white/90" />
                <div className="mt-auto">
                  <div className="text-[10px] font-black text-indigo-100 uppercase mb-1">Potência TX OLT</div>
                  <div className="text-xl font-black text-white">{oltPower.toFixed(1)} dBm</div>
                </div>
              </div>
              {renderBranches(node)}
            </div>
          );
        case NodeType.FIBER:
          return (
            <div className="flex items-center group relative px-4">
              <SidePlus side="left" /><DragHandle />
              <div onMouseDown={(e) => { if(e.button === 0) onStartDrag(e, node); }} className={`w-40 h-2 bg-blue-500 rounded-full relative cursor-grab active:cursor-grabbing shadow-[0_0_10px_rgba(59,130,246,0.3)] ${isThisDragging ? 'scale-y-150' : ''}`}>
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <div className="pointer-events-auto bg-white border border-blue-200 rounded-full px-3 py-1 shadow-lg flex items-center gap-1.5 -mt-16 mb-2">
                    <EditableValue value={node.length || 0} step="1" onCommit={(v) => updateNodeData(node.id, { length: v })} className="w-12 text-xs font-black text-slate-900 bg-transparent border-none p-0 text-center focus:ring-0" />
                    <select value={node.unit} onChange={(e) => updateNodeData(node.id, { unit: e.target.value as DistanceUnit })} className="text-[10px] font-black text-blue-500 bg-transparent border-none p-0 outline-none uppercase cursor-pointer">
                      <option value="m" className="text-slate-900">m</option><option value="km" className="text-slate-900">km</option>
                    </select>
                  </div>
                  <div className="pointer-events-auto bg-white border border-slate-200 rounded-lg px-3 py-1 shadow-md flex items-center gap-1.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity z-[60] mt-12">
                    <EditableValue 
                      value={node.attenuationCoefficient ?? globalDefaults.attenuation} 
                      onCommit={(v) => updateNodeData(node.id, { attenuationCoefficient: v })} 
                      className="w-14 text-[10px] font-bold text-slate-700 bg-slate-50 border border-slate-100 rounded p-0.5 text-center focus:ring-0" 
                    />
                    <span className="text-[8px] font-black text-slate-400 uppercase">dB/km</span>
                  </div>
                </div>
              </div>
              <SidePlus side="right" />
              <button onClick={() => removeElement(node.id)} className="absolute -top-8 right-2 opacity-0 group-hover:opacity-100 p-1.5 text-red-500 bg-white rounded-full border shadow-sm z-50 no-print transition-all hover:scale-110"><Trash2 size={12}/></button>
            </div>
          );
        case NodeType.CONNECTOR:
          return (
            <div className="flex items-center group relative px-4">
              <SidePlus side="left" /><DragHandle />
              <div onMouseDown={(e) => { if(e.button === 0) onStartDrag(e, node); }} className={`w-5 h-10 bg-emerald-500 rounded-sm border-2 border-emerald-600 relative flex items-center justify-center shadow-lg cursor-grab active:cursor-grabbing ${isThisDragging ? 'scale-110' : ''}`}>
                 <div className="w-1.5 h-4 bg-emerald-300 rounded-full opacity-60"></div>
                 <div className="absolute -top-12 left-1/2 -translate-x-1/2 bg-white border border-emerald-100 rounded-xl px-2 py-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-all shadow-xl z-[100] pointer-events-auto flex items-center gap-1">
                    <EditableValue value={node.loss} step="0.05" onCommit={(v) => updateNodeData(node.id, { loss: v })} className="w-10 text-xs font-black text-slate-900 bg-transparent border-none p-0 text-center focus:ring-0" />
                    <span className="text-[9px] font-black text-emerald-400 uppercase">dB</span>
                 </div>
              </div>
              <SidePlus side="right" />
              <button onClick={() => removeElement(node.id)} className="absolute -top-8 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 p-1.5 text-red-500 bg-white rounded-full border shadow-sm z-50 no-print transition-all hover:scale-110"><Trash2 size={12}/></button>
            </div>
          );
        case NodeType.SPLICE:
          return (
            <div className="flex items-center group relative px-4">
              <SidePlus side="left" /><DragHandle />
              <div onMouseDown={(e) => onStartDrag(e, node)} className={`w-7 h-7 rounded-full bg-purple-500 border-2 border-purple-200 flex items-center justify-center shadow-lg cursor-grab active:cursor-grabbing ${isThisDragging ? 'scale-110' : ''}`}>
                 <div className="w-1.5 h-1.5 bg-white rounded-full"></div>
                 <div className="absolute -top-12 left-1/2 -translate-x-1/2 bg-white border border-purple-100 rounded-xl px-2 py-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-all shadow-xl z-[100] pointer-events-auto flex items-center gap-1">
                    <EditableValue value={node.loss} step="0.01" onCommit={(v) => updateNodeData(node.id, { loss: v })} className="w-10 text-xs font-black text-slate-900 bg-transparent border-none p-0 text-center focus:ring-0" />
                    <span className="text-[9px] font-black text-purple-400 uppercase">dB</span>
                 </div>
              </div>
              <SidePlus side="right" />
              <button onClick={() => removeElement(node.id)} className="absolute -top-8 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 p-1.5 text-red-500 bg-white rounded-full border shadow-sm z-50 no-print transition-all hover:scale-110"><Trash2 size={12}/></button>
            </div>
          );
        case NodeType.ONU:
          return (
            <div onMouseDown={(e) => onStartDrag(e, node)} className="flex flex-col items-center group relative ml-6 justify-center cursor-grab active:cursor-grabbing">
               <DragHandle />
               <div className="w-16 h-12 bg-white border-2 border-slate-200 rounded-2xl flex items-center justify-center shadow-lg relative">
                  <div className="flex gap-2"><div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse"></div></div>
                  <button onClick={() => removeElement(node.id)} className="absolute -top-8 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 p-1.5 text-red-400 hover:text-red-600 transition-all bg-white rounded-full border shadow-sm z-20 hover:scale-110"><Trash2 size={12} /></button>
               </div>
               <input 
                 value={node.name} 
                 onChange={(e) => updateNodeData(node.id, { name: e.target.value })} 
                 className="mt-1 text-[8px] font-black text-slate-400 bg-transparent border-none text-center outline-none uppercase w-20"
               />
               <div className={`mt-1 text-[12px] font-black px-2 py-0.5 bg-white rounded-full border shadow-sm ${powerColor(node.powerOut!)}`}>
                 {node.powerOut?.toFixed(1)} dBm
               </div>
            </div>
          );
        default:
          return (
            <div className="flex items-center gap-8 py-10">
              <div onMouseDown={(e) => onStartDrag(e, node)} className="relative group flex items-center cursor-grab active:cursor-grabbing">
                <SidePlus side="left" /><DragHandle />
                <div className={`w-44 bg-white border-2 rounded-3xl p-4 shadow-xl ${node.type === NodeType.SPLITTER ? 'border-amber-400 ring-4 ring-amber-50' : 'border-orange-500 ring-4 ring-orange-50'} ${isThisDragging ? 'scale-105' : ''}`}>
                   <div className="flex justify-between items-center mb-3">
                      <div className={`p-2 rounded-xl ${node.type === NodeType.SPLITTER ? 'bg-amber-100 text-amber-600' : 'bg-orange-100 text-orange-600'}`}>
                        {node.type === NodeType.SPLITTER ? <Zap size={18}/> : <GitBranch size={18}/>}
                      </div>
                      <div className="flex items-center gap-2">
                        <button onClick={() => updateNodeData(node.id, { type: node.type === NodeType.SPLITTER ? NodeType.SPLITTER_UNBALANCED : NodeType.SPLITTER })} className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-500 rounded-lg no-print transition-colors" title="Alternar Balanceado/Desbalanceado">
                          <RefreshCcw size={12}/>
                        </button>
                        <button onClick={() => removeElement(node.id)} className="text-slate-300 hover:text-red-500 p-1 no-print transition-colors"><Trash2 size={14}/></button>
                      </div>
                   </div>
                   <div className="space-y-2">
                      <div className="text-[9px] font-black text-slate-400 uppercase tracking-wider mb-1">{node.type === NodeType.SPLITTER ? 'Splitter Balanceado' : 'Splitter Desbalanceado'}</div>
                      <select className="w-full text-xs font-black bg-slate-50 border border-slate-100 rounded-xl p-2 outline-none uppercase cursor-pointer text-slate-900" value={node.splitterRatio} onChange={(e) => updateNodeData(node.id, { splitterRatio: e.target.value })}>
                          {node.type === NodeType.SPLITTER ? Object.keys(SPLITTER_LOSSES).map(r => <option key={r} value={r} className="text-slate-900">{r}</option>) : Object.keys(UNBALANCED_SPLITTER_LOSSES).map(r => <option key={r} value={r} className="text-slate-900">{r}</option>)}
                      </select>
                      
                      {node.type === NodeType.SPLITTER_UNBALANCED && (
                        <div className="grid grid-cols-2 gap-2 mt-2">
                          <div className="bg-orange-50 rounded-xl p-2 border border-orange-100 flex flex-col items-center">
                             <div className="text-[7px] font-black text-orange-400 uppercase mb-1">Drop</div>
                             <div className="flex items-center gap-0.5">
                               <EditableValue 
                                 value={node.unbalancedDropLoss ?? UNBALANCED_SPLITTER_LOSSES[node.splitterRatio!][0]} 
                                 onCommit={(v) => updateNodeData(node.id, { unbalancedDropLoss: v })} 
                                 className="w-12 text-[10px] font-black text-orange-700 bg-transparent border-none p-0 text-center focus:ring-0" 
                               />
                               <span className="text-[7px] text-orange-300 font-bold uppercase">dB</span>
                             </div>
                          </div>
                          <div className="bg-slate-50 rounded-xl p-2 border border-slate-100 flex flex-col items-center">
                             <div className="text-[7px] font-black text-slate-400 uppercase mb-1">Pass</div>
                             <div className="flex items-center gap-0.5">
                               <EditableValue 
                                 value={node.unbalancedPassLoss ?? UNBALANCED_SPLITTER_LOSSES[node.splitterRatio!][1]} 
                                 onCommit={(v) => updateNodeData(node.id, { unbalancedPassLoss: v })} 
                                 className="w-12 text-[10px] font-black text-slate-700 bg-transparent border-none p-0 text-center focus:ring-0" 
                               />
                               <span className="text-[7px] text-slate-300 font-bold uppercase">dB</span>
                             </div>
                          </div>
                        </div>
                      )}

                      <div className="mt-3 border-t border-slate-100 pt-2 flex justify-between items-center">
                          <span className="text-[10px] font-black text-slate-400 uppercase">Perda Extra</span>
                          <div className="flex items-center gap-0.5">
                            <EditableValue value={node.loss} step="0.1" onCommit={(v) => updateNodeData(node.id, { loss: v })} className="w-10 text-right text-xs font-black text-indigo-600 bg-transparent focus:ring-0" />
                            <span className="text-[9px] text-slate-300 font-bold uppercase">dB</span>
                          </div>
                      </div>
                   </div>
                </div>
                <SidePlus side="right" />
              </div>
              {renderBranches(node)}
            </div>
          );
      }
    };
    return (
      <div style={{ transform: `translateY(${node.offsetY || 0}px)` }} className={`transition-transform duration-75 ease-out select-none ${isThisDragging ? 'z-[100]' : ''}`}>
        {renderContent()}
      </div>
    );
  };

  const renderBranches = (node: NetworkNode) => {
    if (!node.branches || node.branches.length === 0) return null;
    return (
      <div className="flex flex-col gap-20 relative pl-12">
        <div className="absolute left-0 top-14 bottom-14 w-1 bg-slate-200/50 rounded-full"></div>
        {node.branches.map((branch, bIndex) => (
          <div key={bIndex} className="flex items-center relative">
            <div className="w-20 h-0.5 bg-slate-200/50 shrink-0 relative flex items-center">
              <div className="absolute -left-7 top-1/2 -translate-y-1/2 text-[10px] font-black bg-white text-slate-500 w-6 h-6 rounded-full flex items-center justify-center border-2 border-slate-100 shadow-sm z-10">{bIndex + 1}</div>
              {node.type === NodeType.SPLITTER_UNBALANCED && (
                <div className={`absolute left-4 top-2 text-[7px] font-black uppercase px-1 rounded shadow-sm ${bIndex === 0 ? 'bg-orange-600 text-white' : 'bg-slate-600 text-white'}`}>
                  {bIndex === 0 ? 'Drop' : 'Pass'}
                </div>
              )}
              <div className="absolute -right-1 top-1/2 -translate-y-1/2 text-slate-300"><ChevronRight size={14} /></div>
            </div>
            <div className="flex items-center">
              {branch.map((child, cIdx) => <NodeRenderer key={child.id} node={child} parentId={node.id} branchIndex={bIndex} nodeIndex={cIdx} />)}
              <div className="ml-10 flex items-center gap-2 p-2 bg-white/80 border-2 border-dashed border-slate-200 rounded-3xl no-print hover:border-indigo-400 transition-all h-14 hover:-translate-y-0.5">
                <button onClick={() => addElementAtPosition(node.id, bIndex, NodeType.FIBER)} className="p-2 text-blue-500 hover:scale-125 transition-transform" title="Fibra"><Cable size={20}/></button>
                <button onClick={() => addElementAtPosition(node.id, bIndex, NodeType.SPLITTER)} className="p-2 text-amber-500 hover:scale-125 transition-transform" title="Splitter Bal."><Zap size={20}/></button>
                <button onClick={() => addElementAtPosition(node.id, bIndex, NodeType.SPLITTER_UNBALANCED)} className="p-2 text-orange-500 hover:scale-125 transition-transform" title="Splitter Desb."><GitBranch size={20}/></button>
                <button onClick={() => addElementAtPosition(node.id, bIndex, NodeType.CONNECTOR)} className="p-2 text-emerald-500 hover:scale-125 transition-transform" title="Conector"><Settings2 size={20}/></button>
                <button onClick={() => addElementAtPosition(node.id, bIndex, NodeType.SPLICE)} className="p-2 text-purple-500 hover:scale-125 transition-transform" title="Emenda"><Scissors size={20}/></button>
                <button onClick={() => addElementAtPosition(node.id, bIndex, NodeType.ONU)} className="p-2 text-slate-500 hover:scale-125 transition-transform" title="ONU"><ArrowRight size={20}/></button>
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  };

  const ConfigModal = () => (
    <div className="fixed inset-0 z-[400] flex items-center justify-center bg-black/40 backdrop-blur-sm no-print">
      <div className="bg-white rounded-[2.5rem] w-full max-w-md p-10 shadow-2xl animate-in zoom-in duration-200 border border-slate-100">
        <div className="flex justify-between items-center mb-8">
          <div className="flex items-center gap-3">
             <div className="bg-indigo-600 p-2.5 rounded-2xl text-white shadow-lg"><Settings size={22} /></div>
             <h2 className="text-xl font-black text-slate-800 uppercase tracking-tight">Perdas Padrão</h2>
          </div>
          <button onClick={() => setShowConfigModal(false)} className="p-2 hover:bg-slate-50 text-slate-400 hover:text-red-500 rounded-xl transition-all"><X size={20}/></button>
        </div>
        <div className="space-y-6">
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest leading-relaxed">Estes valores serão aplicados a todos os novos itens que você adicionar ao projeto.</p>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100 group transition-colors hover:bg-white hover:border-indigo-100">
              <div className="flex items-center gap-3">
                <div className="bg-blue-100 p-2 rounded-xl text-blue-600 group-hover:bg-blue-600 group-hover:text-white transition-all"><Cable size={18}/></div>
                <div><span className="text-[11px] font-black text-slate-800 uppercase block">Fibra (dB/km)</span><span className="text-[9px] font-bold text-slate-400 uppercase">Atenuação ótica</span></div>
              </div>
              <EditableValue value={globalDefaults.attenuation} onCommit={(v) => setGlobalDefaults({...globalDefaults, attenuation: v})} className="w-16 bg-white border border-slate-200 rounded-xl p-2 text-center text-xs font-black text-indigo-600 focus:ring-0 focus:border-indigo-400" />
            </div>
            <div className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100 group transition-colors hover:bg-white hover:border-indigo-100">
              <div className="flex items-center gap-3">
                <div className="bg-emerald-100 p-2 rounded-xl text-emerald-600 group-hover:bg-emerald-600 group-hover:text-white transition-all"><Settings2 size={18}/></div>
                <div><span className="text-[11px] font-black text-slate-800 uppercase block">Conector (dB)</span><span className="text-[9px] font-bold text-slate-400 uppercase">Acoplamento</span></div>
              </div>
              <EditableValue value={globalDefaults.connector} onCommit={(v) => setGlobalDefaults({...globalDefaults, connector: v})} className="w-16 bg-white border border-slate-200 rounded-xl p-2 text-center text-xs font-black text-indigo-600 focus:ring-0 focus:border-indigo-400" />
            </div>
            <div className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100 group transition-colors hover:bg-white hover:border-indigo-100">
              <div className="flex items-center gap-3">
                <div className="bg-purple-100 p-2 rounded-xl text-purple-600 group-hover:bg-purple-600 group-hover:text-white transition-all"><Scissors size={18}/></div>
                <div><span className="text-[11px] font-black text-slate-800 uppercase block">Emenda (dB)</span><span className="text-[9px] font-bold text-slate-400 uppercase">Conexão fixa</span></div>
              </div>
              <EditableValue value={globalDefaults.splice} onCommit={(v) => setGlobalDefaults({...globalDefaults, splice: v})} className="w-16 bg-white border border-slate-200 rounded-xl p-2 text-center text-xs font-black text-indigo-600 focus:ring-0 focus:border-indigo-400" />
            </div>
            <div className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100 group transition-colors hover:bg-white hover:border-indigo-100">
              <div className="flex items-center gap-3">
                <div className="bg-amber-100 p-2 rounded-xl text-amber-600 group-hover:bg-amber-600 group-hover:text-white transition-all"><Zap size={18}/></div>
                <div><span className="text-[11px] font-black text-slate-800 uppercase block">Extra Splitter (dB)</span><span className="text-[9px] font-bold text-slate-400 uppercase">Adicional por CEO</span></div>
              </div>
              <EditableValue value={globalDefaults.extraLossSplitter} onCommit={(v) => setGlobalDefaults({...globalDefaults, extraLossSplitter: v})} className="w-16 bg-white border border-slate-200 rounded-xl p-2 text-center text-xs font-black text-indigo-600 focus:ring-0 focus:border-indigo-400" />
            </div>
          </div>
        </div>
        <button onClick={() => setShowConfigModal(false)} className="mt-10 w-full py-4 bg-indigo-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl shadow-indigo-100 hover:bg-indigo-700 transition-all active:scale-95">Salvar Configurações</button>
      </div>
    </div>
  );

  const PrintReport = () => (
    <div className="hidden print:block fixed inset-0 z-[1000] bg-white p-12 text-slate-900 overflow-y-auto min-h-screen">
      <div className="border-b-4 border-indigo-600 pb-6 mb-8 flex justify-between items-end">
        <div>
          <h1 className="text-4xl font-black uppercase tracking-tighter mb-1">{projectName}</h1>
          <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">Relatório Técnico de Orçamento de Potência Ótica</p>
        </div>
        <div className="text-right">
          <p className="text-[10px] font-black uppercase text-slate-400">Data de Emissão</p>
          <p className="font-bold">{new Date().toLocaleDateString('pt-BR')}</p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-6 mb-10">
        <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100">
          <p className="text-[10px] font-black text-slate-400 uppercase mb-1">Potência OLT</p>
          <p className="text-2xl font-black text-indigo-600">{oltPower.toFixed(1)} dBm</p>
        </div>
        <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100">
          <p className="text-[10px] font-black text-slate-400 uppercase mb-1">Total de Terminais</p>
          <p className="text-2xl font-black text-indigo-600">{onuList.length} ONUs</p>
        </div>
        <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100">
          <p className="text-[10px] font-black text-slate-400 uppercase mb-1">Qualidade do Link</p>
          <p className={`text-2xl font-black ${onuList.some(o => o.power < -28) ? 'text-red-600' : 'text-emerald-600'}`}>
            {onuList.some(o => o.power < -28) ? 'Atenção' : 'Excelente'}
          </p>
        </div>
      </div>

      <div className="mb-12 break-inside-avoid">
        <h3 className="text-lg font-black uppercase tracking-tight mb-6 flex items-center gap-2">
          <Network size={20} className="text-indigo-600" /> Diagrama da Topologia
        </h3>
        <div className="bg-slate-50 border border-slate-200 rounded-[2.5rem] p-12 overflow-x-auto flex items-center justify-center min-h-[500px]">
           <div className="origin-center scale-90">
             <NodeRenderer node={tree} />
           </div>
        </div>
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-4 text-center">Visualização oficial da infraestrutura e perdas ponto a ponto</p>
      </div>

      <div className="mb-10">
        <h3 className="text-lg font-black uppercase tracking-tight mb-4 flex items-center gap-2">
          <ClipboardList size={20} className="text-indigo-600" /> Detalhamento de ONUs
        </h3>
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-slate-100 text-left">
              <th className="p-4 text-[10px] font-black uppercase border-b-2 border-slate-200">Terminal</th>
              <th className="p-4 text-[10px] font-black uppercase border-b-2 border-slate-200">Hierarquia/Caminho</th>
              <th className="p-4 text-[10px] font-black uppercase border-b-2 border-slate-200 text-right">Potência (dBm)</th>
              <th className="p-4 text-[10px] font-black uppercase border-b-2 border-slate-200 text-center">Status</th>
            </tr>
          </thead>
          <tbody>
            {onuList.map((onu, idx) => (
              <tr key={idx} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                <td className="p-4 font-bold text-slate-700">{onu.name}</td>
                <td className="p-4 text-[10px] font-medium text-slate-500">{onu.path}</td>
                <td className={`p-4 font-black text-right ${onu.power < -28 ? 'text-red-600' : 'text-emerald-600'}`}>{onu.power.toFixed(2)}</td>
                <td className="p-4 text-center">
                  <span className={`text-[8px] font-black uppercase px-2 py-1 rounded-full ${onu.power < -28 ? 'bg-red-100 text-red-600' : 'bg-emerald-100 text-emerald-600'}`}>
                    {onu.power < -28 ? 'ALTA PERDA' : 'LINK OK'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid grid-cols-2 gap-8 mb-10 break-inside-avoid">
        <div>
          <h3 className="text-lg font-black uppercase tracking-tight mb-4 flex items-center gap-2">Configurações Base</h3>
          <div className="bg-slate-50 rounded-3xl p-6 border border-slate-100 space-y-3">
            <div className="flex justify-between border-b border-slate-200 pb-2 text-xs">
              <span className="font-bold text-slate-500 uppercase">Atenuação Fibra:</span>
              <span className="font-black text-indigo-600">{globalDefaults.attenuation} dB/km</span>
            </div>
            <div className="flex justify-between border-b border-slate-200 pb-2 text-xs">
              <span className="font-bold text-slate-500 uppercase">Perda Conector:</span>
              <span className="font-black text-indigo-600">{globalDefaults.connector} dB</span>
            </div>
            <div className="flex justify-between border-b border-slate-200 pb-2 text-xs">
              <span className="font-bold text-slate-500 uppercase">Perda Emenda:</span>
              <span className="font-black text-indigo-600">{globalDefaults.splice} dB</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="font-bold text-slate-500 uppercase">Extra Splitter:</span>
              <span className="font-black text-indigo-600">{globalDefaults.extraLossSplitter} dB</span>
            </div>
          </div>
        </div>
        <div className="bg-indigo-50 p-6 rounded-3xl border border-indigo-100">
          <h3 className="text-sm font-black text-indigo-600 uppercase mb-3">Notas de Engenharia</h3>
          <p className="text-[10px] text-indigo-900/70 leading-relaxed font-bold">
            Relatório gerado automaticamente pelo PON Diagram Editor. Os cálculos de link budget respeitam as normas ITU-T G.984. 
            Cuidado: Sinais abaixo de -28dBm em ONUs podem causar instabilidade extrema, erros de sincronismo e queda de performance. 
          </p>
        </div>
      </div>

      <div className="mt-auto pt-10 border-t border-slate-100 flex justify-between items-center text-[8px] font-black text-slate-300 uppercase tracking-widest">
        <span>RELATÓRIO TÉCNICO OFICIAL - PON DIAGRAM EDITOR V2.1</span>
      </div>
    </div>
  );

  return (
    <div className={`h-screen w-screen flex flex-col overflow-hidden bg-slate-50 ${isPanning ? 'cursor-grabbing' : ''} print:h-auto print:overflow-visible`}>
      {showConfigModal && <ConfigModal />}
      <PrintReport />
      
      {insertionMenu && (
        <div className="fixed z-[300] bg-white border border-slate-200 rounded-3xl shadow-2xl p-2.5 flex gap-2 no-print" style={{ left: insertionMenu.x - 120, top: insertionMenu.y - 80 }} onMouseLeave={() => setInsertionMenu(null)}>
          <button onClick={() => addElementAtPosition(insertionMenu.parentId, insertionMenu.branchIndex, NodeType.FIBER, insertionMenu.insertIndex)} className="p-3 hover:bg-blue-50 text-blue-500 rounded-2xl transition-all" title="Fibra"><Cable size={22}/></button>
          <button onClick={() => addElementAtPosition(insertionMenu.parentId, insertionMenu.branchIndex, NodeType.SPLITTER, insertionMenu.insertIndex)} className="p-3 hover:bg-amber-50 text-amber-500 rounded-2xl transition-all" title="Splitter Bal."><Zap size={22}/></button>
          <button onClick={() => addElementAtPosition(insertionMenu.parentId, insertionMenu.branchIndex, NodeType.SPLITTER_UNBALANCED, insertionMenu.insertIndex)} className="p-3 hover:bg-orange-50 text-orange-500 rounded-2xl transition-all" title="Splitter Desb."><GitBranch size={22}/></button>
          <button onClick={() => addElementAtPosition(insertionMenu.parentId, insertionMenu.branchIndex, NodeType.CONNECTOR, insertionMenu.insertIndex)} className="p-3 hover:bg-emerald-50 text-emerald-500 rounded-2xl transition-all" title="Conector"><Settings2 size={22}/></button>
          <button onClick={() => addElementAtPosition(insertionMenu.parentId, insertionMenu.branchIndex, NodeType.SPLICE, insertionMenu.insertIndex)} className="p-3 hover:bg-purple-50 text-purple-500 rounded-2xl transition-all" title="Emenda"><Scissors size={22}/></button>
        </div>
      )}

      <header className="bg-white border-b border-slate-200 px-10 py-5 sticky top-0 z-[200] flex justify-between items-center shrink-0 no-print shadow-sm">
        <div className="flex items-center gap-6">
          <div className="bg-indigo-600 p-3 rounded-2xl text-white shadow-xl transform hover:rotate-2 transition-transform"><Database size={28} /></div>
          <div className="flex flex-col">
            <div className="flex items-center gap-2 group">
              <input 
                value={projectName} 
                onChange={(e) => setProjectName(e.target.value)} 
                className="text-xl font-black text-slate-800 tracking-tighter uppercase leading-none bg-transparent border-none outline-none focus:ring-2 focus:ring-indigo-100 rounded px-1 w-64"
                placeholder="NOME DO PROJETO"
              />
              <Edit3 size={14} className="text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
            <p className="text-[10px] text-slate-400 font-bold tracking-widest uppercase mt-1">Professional Link Budgeting Editor</p>
          </div>
          <div className="flex gap-2 ml-4 px-4 border-l border-slate-100">
            <button onClick={undo} disabled={history.past.length === 0} className={`p-2 rounded-xl border transition-all ${history.past.length === 0 ? 'bg-slate-50 text-slate-300 border-slate-100 cursor-not-allowed' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50 active:scale-95'}`} title="Desfazer (Ctrl+Z)"><Undo2 size={18} /></button>
            <button onClick={redo} disabled={history.future.length === 0} className={`p-2 rounded-xl border transition-all ${history.future.length === 0 ? 'bg-slate-50 text-slate-300 border-slate-100 cursor-not-allowed' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50 active:scale-95'}`} title="Refazer (Ctrl+Y)"><Redo2 size={18} /></button>
          </div>
        </div>
        <div className="flex items-center gap-3">
           <div className="bg-white border-2 border-slate-100 rounded-2xl p-1 flex items-center shadow-sm">
              <button onClick={() => setZoom(prev => Math.max(prev - 0.1, 0.2))} className="p-2 hover:bg-slate-50 text-slate-500 rounded-xl transition-colors" title="Zoom Out"><ZoomOut size={18}/></button>
              <div className="px-3 text-[10px] font-black text-slate-400 w-12 text-center">{(zoom * 100).toFixed(0)}%</div>
              <button onClick={() => setZoom(prev => Math.min(prev + 0.1, 3.0))} className="p-2 hover:bg-slate-50 text-slate-500 rounded-xl transition-colors" title="Zoom In"><ZoomIn size={18}/></button>
              <button onClick={() => setZoom(1.0)} className="ml-1 p-2 bg-indigo-50 text-indigo-600 hover:bg-indigo-100 rounded-xl transition-colors" title="Reset Zoom"><Search size={16}/></button>
           </div>
           
           <button onClick={() => setShowConfigModal(true)} className="p-4 bg-white border-2 border-indigo-50 text-indigo-600 rounded-2xl hover:bg-indigo-50 transition-all flex items-center gap-2 font-bold text-xs shadow-sm shadow-indigo-50">
             <Settings2 size={18} /> PADRÕES
           </button>

           <div className="bg-slate-50 border-2 border-indigo-50 rounded-2xl px-6 py-3 flex flex-col min-w-[120px]">
              <span className="text-[9px] font-black text-slate-400 uppercase mb-1">TX Power OLT</span>
              <div className="flex items-center gap-1">
                <EditableValue value={oltPower} step="0.5" onCommit={(v) => { saveHistory(rootNode, oltPower); setOltPower(v); }} className="w-12 bg-transparent text-xl font-black text-indigo-600 focus:outline-none" />
                <span className="text-sm font-bold text-slate-300">dBm</span>
              </div>
           </div>
           <div className="flex gap-2">
             <button onClick={() => fileInputRef.current?.click()} className="p-4 bg-white border-2 border-slate-200 text-slate-600 rounded-2xl hover:bg-slate-50 transition-all flex items-center gap-2 font-bold text-xs shadow-sm"><Upload size={18}/> IMPORTAR</button>
             <button onClick={exportProject} className="p-4 bg-indigo-600 text-white rounded-2xl hover:bg-indigo-700 transition-all flex items-center gap-2 font-bold text-xs shadow-lg"><Download size={18}/> EXPORTAR</button>
             <div className="flex bg-white border-2 border-slate-200 rounded-2xl shadow-sm overflow-hidden">
                <button onClick={exportToWord} className="p-4 hover:bg-slate-50 border-r border-slate-100 text-blue-600 transition-colors flex items-center gap-2 font-bold text-xs" title="Relatório Word"><FileDown size={18}/> WORD</button>
                <button onClick={() => window.print()} className="p-4 hover:bg-slate-50 text-slate-600 transition-colors flex items-center gap-2 font-bold text-xs" title="PDF"><FileText size={18}/> PDF</button>
             </div>
           </div>
           <input type="file" ref={fileInputRef} onChange={importProject} accept=".json" className="hidden" />
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden no-print">
        <main 
          ref={mainRef}
          onMouseDown={handlePanStart}
          onMouseMove={handlePanMove}
          onMouseUp={handlePanEnd}
          onMouseLeave={handlePanEnd}
          className="flex-1 overflow-auto bg-[radial-gradient(#e2e8f0_1px,transparent_1px)] [background-size:32px_32px] custom-scrollbar relative"
        >
           <div 
             className="inline-flex min-w-full min-h-full items-center justify-center origin-center transition-transform duration-100 ease-out"
             style={{ transform: `scale(${zoom})`, padding: '400px' }}
           >
              <NodeRenderer node={tree} />
           </div>
        </main>
        
        <aside className="w-[380px] bg-white border-l border-slate-200 p-10 space-y-8 no-print overflow-y-auto shadow-xl z-[150]">
           <div className="space-y-4">
              <h4 className="text-sm font-black text-slate-800 flex items-center gap-2 tracking-tight uppercase"><Layout size={18}/> Painel de Relatório</h4>
              <div className="bg-slate-50 p-6 rounded-3xl border border-slate-100 shadow-sm space-y-4">
                 <div className="flex justify-between items-center">
                    <span className="text-[10px] font-black text-slate-400 uppercase">Total de ONUs</span>
                    <span className="text-xs font-black text-slate-800">{onuList.length}</span>
                 </div>
                 <div className="flex justify-between items-center">
                    <span className="text-[10px] font-black text-slate-400 uppercase">Pior Sinal</span>
                    <span className={`text-xs font-black ${onuList.length && Math.min(...onuList.map(o => o.power)) < -28 ? 'text-red-600' : 'text-slate-800'}`}>
                      {onuList.length ? Math.min(...onuList.map(o => o.power)).toFixed(2) : "0.00"} dBm
                    </span>
                 </div>
                 <div className="flex justify-between items-center">
                    <span className="text-[10px] font-black text-slate-400 uppercase">Melhor Sinal</span>
                    <span className="text-xs font-black text-emerald-600">
                      {onuList.length ? Math.max(...onuList.map(o => o.power)).toFixed(2) : "0.00"} dBm
                    </span>
                 </div>
              </div>
           </div>
           
           <div className="space-y-4">
              <h4 className="text-sm font-black text-slate-800 flex items-center gap-2 tracking-tight uppercase"><ClipboardList size={18}/> Lista de ONUs</h4>
              <div className="max-h-60 overflow-y-auto custom-scrollbar border border-slate-100 rounded-3xl">
                <table className="w-full text-left">
                  <thead className="sticky top-0 bg-white border-b border-slate-100">
                    <tr>
                      <th className="p-3 text-[9px] font-black text-slate-400 uppercase">Nome</th>
                      <th className="p-3 text-[9px] font-black text-slate-400 uppercase text-right">Potência</th>
                    </tr>
                  </thead>
                  <tbody>
                    {onuList.map((onu, i) => (
                      <tr key={i} className="border-b border-slate-50 hover:bg-slate-50">
                        <td className="p-3 text-[10px] font-black text-slate-600">{onu.name}</td>
                        <td className={`p-3 text-[10px] font-black text-right ${onu.power < -28 ? 'text-red-600' : 'text-emerald-600'}`}>{onu.power.toFixed(1)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
           </div>

           <div className="p-6 bg-indigo-50 rounded-3xl border border-indigo-100 flex flex-col gap-3">
              <h5 className="text-xs font-black text-indigo-600 uppercase flex items-center gap-2"><Sparkles size={14}/> Orçamento de Potência</h5>
              <p className="text-[11px] text-indigo-500/80 leading-relaxed font-bold">Cálculo em tempo real seguindo padrões ITU-T. Mantenha as ONUs com sinal acima de -28dBm para estabilidade máxima.</p>
           </div>
        </aside>
      </div>
    </div>
  );
};

const root = ReactDOM.createRoot(document.getElementById('root')!);
root.render(<App />);
