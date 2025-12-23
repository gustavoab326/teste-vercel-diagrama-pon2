
export enum NodeType {
  OLT = 'OLT',
  FIBER = 'FIBER',
  SPLITTER = 'SPLITTER',
  SPLITTER_UNBALANCED = 'SPLITTER_UNBALANCED',
  CONNECTOR = 'CONNECTOR',
  SPLICE = 'SPLICE',
  ONU = 'ONU'
}

export type DistanceUnit = 'm' | 'km';

export interface NetworkNode {
  id: string;
  type: NodeType;
  name: string;
  loss: number; // dB (perda deste componente específico)
  length?: number; // Valor da distância
  unit?: DistanceUnit; // 'm' ou 'km'
  offsetY?: number; // Deslocamento vertical para ajuste visual
  attenuationCoefficient?: number; // dB/km (para fibra)
  splitterRatio?: string; // Ex: "1:8" ou "10/90"
  branches?: NetworkNode[][]; // Cada array interno é uma sequência de componentes em um ramo
  powerIn?: number; // dBm (calculado)
  powerOut?: number; // dBm (calculado)
}
