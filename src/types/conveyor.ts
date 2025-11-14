export type ComponentType = 
  | 'belt' 
  | 'roller' 
  | 'motor' 
  | 'frame' 
  | 'sensor' 
  | 'drive-unit'
  | 'support-leg';

export interface ConveyorComponent {
  id: string;
  type: ComponentType;
  name: string;
  position: [number, number, number];
  rotation: [number, number, number];
  dimensions: {
    length?: number;
    width?: number;
    height?: number;
    diameter?: number;
  };
  material: string;
  specifications: Record<string, string | number>;
  cost?: number;
  partNumber?: string;
  processing_status?: string;
  processing_error?: string;
  glb_url?: string | null;
  original_url?: string | null;
}

export interface BOMItem {
  id: string;
  partNumber: string;
  description: string;
  quantity: number;
  material: string;
  unitCost: number;
  totalCost: number;
}

export interface ConveyorSystem {
  id: string;
  name: string;
  components: ConveyorComponent[];
  totalLength: number;
  beltSpeed: number;
  capacity: number;
}
