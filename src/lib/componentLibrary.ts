export type LibraryKey = 'belt' | 'motor' | 'roller' | 'frame' | 'sensor' | 'drive-unit';

export interface ComponentMeta {
  type: LibraryKey;
  name: string;
  path?: string; // GLTF/GLB relative path under /public/models
  scale?: number; // uniform scale to apply after load
  defaultSize?: { length?: number; width?: number; height?: number; diameter?: number };
  bom?: {
    partNumber: string;
    description: string;
    material: string;
    unitCost: number;
  };
}

export const ComponentLibrary: Record<LibraryKey, ComponentMeta> = {
  belt: {
    type: 'belt',
    name: 'Conveyor Belt',
    path: '/models/conveyor.glb',
    scale: 1,
    defaultSize: { length: 6, width: 1.2, height: 0.3 },
    bom: { partNumber: 'CVB-6x1.2', description: 'Conveyor Belt Assembly 6m x 1.2m', material: 'Industrial Rubber', unitCost: 1800 }
  },
  motor: {
    type: 'motor',
    name: 'Drive Motor',
    path: '/models/motor.glb',
    scale: 1,
    bom: { partNumber: 'MTR-2.2-IE3', description: 'Drive Motor 2.2kW IE3', material: 'Steel Housing', unitCost: 850 }
  },
  roller: {
    type: 'roller',
    name: 'Support Roller',
    path: '/models/roller.glb',
    scale: 1,
    defaultSize: { diameter: 0.15, length: 1.2 },
    bom: { partNumber: 'RLR-150-ST', description: 'Support Roller Ø150mm', material: 'Steel', unitCost: 75 }
  },
  frame: {
    type: 'frame',
    name: 'Frame Section',
    path: '/models/frame.glb',
    scale: 1,
    bom: { partNumber: 'FRM-3-ALU', description: 'Aluminum Frame Section 3m', material: 'Aluminum Alloy', unitCost: 220 }
  },
  sensor: {
    type: 'sensor',
    name: 'Proximity Sensor',
    path: '/models/sensor.glb',
    scale: 1,
    bom: { partNumber: 'SNS-PX-24V', description: 'Proximity Sensor 24VDC', material: 'Plastic/Metal', unitCost: 120 }
  },
  'drive-unit': {
    type: 'drive-unit',
    name: 'Drive Unit',
    path: '/models/drive_unit.glb',
    scale: 1,
    bom: { partNumber: 'DRV-RED-40', description: 'Gear Reducer Assembly', material: 'Steel', unitCost: 560 }
  }
};

export function getComponentMeta(type: LibraryKey): ComponentMeta {
  return ComponentLibrary[type];
}


